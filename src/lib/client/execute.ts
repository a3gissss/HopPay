import { Connection, VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import { api, ApiError, DEPLOYED } from "./api.ts";
import type { ConfirmBody, PreparedTxs } from "./api.ts";

// Deploys one MultiHopper transfer from the user's wallet:
//   prepare -> sign+send keeperFundingTx -> confirm (intermediate)
//   prepare -> sign all remaining -> send in order, each confirmed -> confirm (final)
// /prepare is resumable (it drops anything already on chain), so every failure path just loops.

export type Signer = {
  signTransaction: <T extends VersionedTransaction>(tx: T) => Promise<T>;
  signAllTransactions?: <T extends VersionedTransaction>(txs: T[]) => Promise<T[]>;
};

export type Progress = (message: string) => void;

type Group = "routeInit" | "orchestratorInit" | "sessionInit" | "dispersionInit";

const MAX_ROUNDS = 6;

function decode(b64: string): VersionedTransaction {
  // Handles both legacy (orchestratorInitTx) and v0 messages.
  return VersionedTransaction.deserialize(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
}

async function sendAndConfirm(connection: Connection, tx: VersionedTransaction, p: PreparedTxs): Promise<string> {
  const signature = bs58.encode(tx.signatures[0]);
  try {
    await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
  } catch (e) {
    // A resend of something that already landed is fine; anything else is real.
    if (!/already been processed/i.test(String((e as Error).message))) throw e;
  }
  const res = await connection.confirmTransaction(
    { signature, blockhash: p.recentBlockhash, lastValidBlockHeight: p.lastValidBlockHeight },
    "confirmed",
  );
  if (res.value.err) throw new Error(`Transaction ${signature.slice(0, 8)}… failed: ${JSON.stringify(res.value.err)}`);
  return signature;
}

async function signAll(signer: Signer, txs: VersionedTransaction[]): Promise<VersionedTransaction[]> {
  if (txs.length > 1 && signer.signAllTransactions) return signer.signAllTransactions(txs);
  const out: VersionedTransaction[] = [];
  for (const tx of txs) out.push(await signer.signTransaction(tx));
  return out;
}

export async function deployTransfer(id: number, connection: Connection, signer: Signer, progress: Progress) {
  const sigs: Record<Group, string[]> = { routeInit: [], orchestratorInit: [], sessionInit: [], dispersionInit: [] };
  let keeperFundingSignature: string | undefined;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    progress("Preparing transactions");
    let p: PreparedTxs;
    try {
      p = (await api.prepare(id)).preparedTxs;
    } catch (e) {
      // MH_035: already finished, there is nothing left to deploy.
      if (e instanceof ApiError && e.code === "MH_035") return api.get(id);
      throw e;
    }

    // Status can't decide this: a transfer reads `processing` as soon as its keeper funding lands,
    // with the route still undeployed. Only an empty /prepare means everything is on chain.
    if (!p.resume.nothingToDo) {
      if (p.keeperFundingTx) {
        // Must land and be recorded before anything else.
        progress("Approve the keeper funding transaction in your wallet");
        const signed = await signer.signTransaction(decode(p.keeperFundingTx));
        progress("Sending keeper funding");
        keeperFundingSignature = await sendAndConfirm(connection, signed, p);
        try {
          await api.confirm(id, { routeInitSignatures: [], keeperFundingSignature });
        } catch (e) {
          // Multi-destination routes answer MH_041 until their bindings exist. Harmless here:
          // /prepare finds the landed funding on chain and never asks for it twice.
          if (!(e instanceof ApiError) || e.code !== "MH_041") throw e;
        }
        continue; // re-prepare: fresh blockhash for the rest
      }

      const ordered: { group: Group; tx: VersionedTransaction }[] = [
        ...p.routeInitTxs.map((t) => ({ group: "routeInit" as const, tx: decode(t.base64) })),
        ...(p.orchestratorInitTx ? [{ group: "orchestratorInit" as const, tx: decode(p.orchestratorInitTx) }] : []),
        ...p.sessionInitTxs.map((b) => ({ group: "sessionInit" as const, tx: decode(b) })),
        ...(p.dispersionInitTxs ?? []).map((b) => ({ group: "dispersionInit" as const, tx: decode(b) })),
      ];
      progress(`Approve ${ordered.length} route transaction${ordered.length === 1 ? "" : "s"} in your wallet`);
      const signed = await signAll(
        signer,
        ordered.map((o) => o.tx),
      );
      try {
        for (let i = 0; i < signed.length; i++) {
          progress(`Sending transaction ${i + 1} of ${signed.length}`);
          sigs[ordered[i].group].push(await sendAndConfirm(connection, signed[i], p));
        }
      } catch (e) {
        // Usually an expired blockhash. Whatever landed is skipped by the next /prepare.
        progress(`Retrying: ${(e as Error).message}`);
      }
      continue; // re-prepare to confirm nothing is left
    }

    progress("Starting the route");
    const body: ConfirmBody = {
      routeInitSignatures: sigs.routeInit,
      keeperFundingSignature,
      orchestratorInitSignature: sigs.orchestratorInit[0],
      sessionInitSignatures: sigs.sessionInit.length ? sigs.sessionInit : undefined,
      dispersionInitSignatures: sigs.dispersionInit.length ? sigs.dispersionInit : undefined,
    };
    try {
      const { transfer: confirmed } = await api.confirm(id, body);
      if (DEPLOYED.includes(confirmed.status)) return confirmed;
    } catch (e) {
      if (e instanceof ApiError && e.code === "MH_035") return api.get(id);
      // MH_041: payout bindings not all on chain yet; MH_036: a tx not yet visible. Re-prepare and retry.
      if (!(e instanceof ApiError) || !["MH_041", "MH_036"].includes(e.code)) throw e;
      progress("Waiting for the chain to catch up");
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error("The route did not start after several attempts. Use Resume to try again; nothing already sent is lost.");
}
