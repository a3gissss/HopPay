import { authed, readJson } from "@/lib/server/handler";
import { mh, MhError } from "@/lib/server/mh";
import { address, destinations, int, ref, symbol } from "@/lib/server/validate";
import { sum, toDecimalString } from "@/lib/amounts";

/** Creates one MultiHopper transfer (one route) for a slice of a payout batch. */
export const POST = authed(async (req, wallet) => {
  const b = await readJson(req);
  const batchId = ref(b.batchId, "batchId");
  const index = int(b.index, "index", 0, 999);
  const tokenDecimals = int(b.tokenDecimals, "tokenDecimals", 0, 18);
  const dests = destinations(b.recipients);
  const amountRaw = sum(dests.map((d) => d.amountRaw));

  // Deterministic per batch slice, so a retried create returns the same transfer instead of a second one.
  const externalId = `hp_${batchId}_${index}`;

  const body: Record<string, unknown> = {
    tokenMint: address(b.tokenMint, "tokenMint"),
    tokenDecimals,
    tokenSymbol: symbol(b.tokenSymbol),
    amountRaw: amountRaw.toString(),
    amountTokens: toDecimalString(amountRaw, tokenDecimals),
    sourceOwner: wallet,
    hops: int(b.hops, "hops", 3, 10),
    arrivalSeconds: int(b.arrivalSeconds, "arrivalSeconds", 60, 2_592_000),
    externalId,
  };
  if (dests.length === 1) body.recipientWallet = dests[0].wallet;
  else body.destinations = dests.map((d) => ({ wallet: d.wallet, amountRaw: d.amountRaw.toString() }));

  let transfer;
  try {
    transfer = await mh("/transfers", { method: "POST", body, idempotencyKey: externalId });
  } catch (e) {
    // Already created on an earlier attempt: hand back that one.
    if (e instanceof MhError && e.code === "MH_033") transfer = await mh(`/transfers/by-external/${externalId}`);
    else throw e;
  }
  if (transfer?.sourceOwner !== wallet) throw new MhError(409, "MH_033", "externalId belongs to another transfer");
  return transfer;
});
