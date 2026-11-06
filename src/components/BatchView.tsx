"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { api, DEPLOYED, TERMINAL, Transfer } from "@/lib/client/api";
import { Batch, BatchChunk, getBatch, updateChunk } from "@/lib/client/batches";
import { deployTransfer } from "@/lib/client/execute";
import { formatAmount, sum } from "@/lib/amounts";
import { explorerAccount, explorerTx } from "@/lib/tokens";

const POLL_MS = 6000;
const RETRIES_PER_CHUNK = 9;

type RowStatus = { label: string; tone: "muted" | "busy" | "ok" | "bad"; received?: string; signature?: string | null; paidAt?: string | null };

function short(a: string) {
  return `${a.slice(0, 4)}…${a.slice(-4)}`;
}

function rowStatus(t: Transfer | undefined, wallet: string): RowStatus {
  if (!t) return { label: "Not started", tone: "muted" };
  const dest = t.destinations?.find((d) => d.wallet === wallet);
  const lastHopSig = t.route?.hops.at(-1)?.txSignature ?? t.signatures?.hops.at(-1) ?? null;
  const received = dest?.amountRaw ?? t.recipientReceivesRaw;
  if (dest?.status === "paid" || (!dest && t.status === "completed")) {
    return { label: "Paid", tone: "ok", received, signature: dest?.payoutSignature ?? lastHopSig, paidAt: dest?.paidAt };
  }
  switch (t.status) {
    case "quote":
    case "awaiting_signature":
      return { label: "Awaiting signature", tone: "muted", received };
    case "processing":
      return { label: t.phase === "deploying" ? "Setting up route" : "Screening", tone: "busy", received };
    case "active": {
      const p = t.progress;
      return { label: p && p.hopsCompleted < p.hopsTotal ? `Routing ${p.hopsCompleted}/${p.hopsTotal}` : "Paying out", tone: "busy", received };
    }
    case "refunded":
      return { label: "Refunded to you", tone: "bad" };
    case "expired":
      return { label: "Expired", tone: "bad" };
    case "failed":
      return { label: "Failed", tone: "bad" };
    default:
      return { label: t.status, tone: "muted", received };
  }
}

const TONE: Record<RowStatus["tone"], string> = {
  muted: "bg-slate-100 text-slate-600",
  busy: "bg-indigo-50 text-indigo-700",
  ok: "bg-emerald-50 text-emerald-700",
  bad: "bg-rose-50 text-rose-700",
};

function csvCell(v: string | number | null | undefined) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function BatchView({ id }: { id: string }) {
  const { connection } = useConnection();
  const { publicKey, signTransaction, signAllTransactions } = useWallet();
  const [batch, setBatch] = useState<Batch | null | undefined>(undefined);
  const [transfers, setTransfers] = useState<Record<number, Transfer>>({});
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const runningRef = useRef(false);

  useEffect(() => setBatch(getBatch(id) ?? null), [id]);

  const setChunk = useCallback(
    (index: number, patch: Partial<BatchChunk>) => {
      const next = updateChunk(id, index, patch);
      if (next) setBatch({ ...next });
    },
    [id],
  );

  const refresh = useCallback(async () => {
    const b = getBatch(id);
    if (!b) return;
    const pending = b.chunks.filter((c) => c.transferId && !TERMINAL.includes(c.status as never));
    for (const c of pending) {
      try {
        const t = await api.get(c.transferId!);
        setTransfers((prev) => ({ ...prev, [c.index]: t }));
        if (t.status !== c.status) setChunk(c.index, { status: t.status });
      } catch {
        // transient; next poll retries
      }
    }
  }, [id, setChunk]);

  // Load every known transfer once, then keep polling the unfinished ones.
  useEffect(() => {
    const b = getBatch(id);
    b?.chunks
      .filter((c) => c.transferId)
      .forEach((c) => api.get(c.transferId!).then((t) => setTransfers((p) => ({ ...p, [c.index]: t }))).catch(() => undefined));
    const timer = setInterval(() => {
      if (!runningRef.current) refresh();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [id, refresh]);

  async function run() {
    if (!batch || !publicKey || !signTransaction) return;
    if (publicKey.toBase58() !== batch.owner) {
      setError(`Connect the wallet that created this batch (${short(batch.owner)}).`);
      return;
    }
    setRunning(true);
    runningRef.current = true;
    setError(null);
    let current: number | null = null;
    try {
      for (const c of getBatch(id)!.chunks) {
        // `processing` may still be missing route transactions; re-checking it costs no wallet prompt.
        if (c.status === "active" || c.status === "completed" || c.status === "refunded") continue;
        current = c.index;
        const label = `Route ${c.index + 1} of ${batch.chunks.length}`;
        const retry = c.status === "expired" || c.status === "failed";
        const attempt = (c.attempt ?? 0) + (retry ? 1 : 0);
        if (attempt > RETRIES_PER_CHUNK) throw new Error(`${label} failed too many times. Contact MultiHopper support.`);
        let transferId = retry ? undefined : c.transferId;

        if (!transferId) {
          setProgress(`${label}: creating quote`);
          const t = await api.create({
            batchId: batch.id,
            index: c.index + attempt * 100,
            tokenMint: batch.token.mint,
            tokenDecimals: batch.token.decimals,
            tokenSymbol: batch.token.symbol,
            hops: batch.hops,
            arrivalSeconds: batch.arrivalSeconds,
            recipients: c.recipients.map((i) => ({ wallet: batch.recipients[i].wallet, amountRaw: batch.recipients[i].sendRaw })),
          });
          transferId = t.id;
          setTransfers((p) => ({ ...p, [c.index]: t }));
          setChunk(c.index, { transferId, attempt, status: t.status, error: undefined });
        }

        const t = await deployTransfer(transferId, connection, { signTransaction, signAllTransactions }, (m) =>
          setProgress(`${label}: ${m}`),
        );
        setTransfers((p) => ({ ...p, [c.index]: t }));
        setChunk(c.index, { status: t.status, error: undefined });
      }
      setProgress(null);
    } catch (e) {
      const msg = (e as Error).message;
      const declined = /reject|declin|cancel/i.test(msg);
      setError(declined ? "You declined in your wallet. Press Resume to continue where you left off." : msg);
      if (current !== null && !declined) setChunk(current, { error: msg });
      setProgress(null);
    } finally {
      setRunning(false);
      runningRef.current = false;
      refresh();
    }
  }

  function exportReceipt() {
    if (!batch) return;
    const header = ["label", "wallet", "amount_requested", "amount_routed", "amount_received", "token", "status", "payout_signature", "paid_at", "transfer_id", "support_ref"];
    const lines = [header.join(",")];
    for (const c of batch.chunks) {
      const t = transfers[c.index];
      for (const i of c.recipients) {
        const r = batch.recipients[i];
        const s = rowStatus(t, r.wallet);
        lines.push(
          [
            r.label,
            r.wallet,
            formatAmount(r.targetRaw, batch.token.decimals).replace(/,/g, ""),
            formatAmount(r.sendRaw, batch.token.decimals).replace(/,/g, ""),
            s.received ? formatAmount(s.received, batch.token.decimals).replace(/,/g, "") : "",
            batch.token.symbol,
            s.label,
            s.signature,
            s.paidAt,
            t?.id,
            t?.supportBundleId,
          ]
            .map(csvCell)
            .join(","),
        );
      }
    }
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `${batch.name.replace(/[^\w-]+/g, "_")}-receipt.csv` });
    a.click();
    URL.revokeObjectURL(url);
  }

  if (batch === undefined) return null;
  if (batch === null) {
    return (
      <div className="card text-center">
        <p className="text-muted">This batch isn&apos;t stored in this browser.</p>
        <Link href="/" className="btn mt-4">Back</Link>
      </div>
    );
  }

  const total = sum(batch.recipients.map((r) => BigInt(r.targetRaw)));
  const allRows = batch.chunks.flatMap((c) => c.recipients.map((i) => ({ c, r: batch.recipients[i], s: rowStatus(transfers[c.index], batch.recipients[i].wallet) })));
  const paid = allRows.filter((x) => x.s.tone === "ok").length;
  const needsAction = batch.chunks.some(
    // Only `processing` + `deploying` means transactions are missing; `active` also passes through that phase.
    (c) => !(c.status === "refunded" || (DEPLOYED.includes(c.status as never) && !(c.status === "processing" && transfers[c.index]?.phase === "deploying"))),
  );
  const started = batch.chunks.some((c) => c.transferId);

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link href="/" className="text-xs text-brand hover:underline">← All batches</Link>
            <h1 className="mt-1 text-2xl font-bold">{batch.name}</h1>
            <p className="mt-1 text-sm text-muted">
              {formatAmount(total, batch.token.decimals)} {batch.token.symbol} to {batch.recipients.length} recipients · {batch.chunks.length} route
              {batch.chunks.length === 1 ? "" : "s"} · {batch.hops} hops
              {batch.feeCoveredBySender && " · fee covered by sender"}
            </p>
          </div>
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={exportReceipt} disabled={!started}>Export receipt</button>
            {needsAction && (
              <button className="btn" onClick={run} disabled={running || !publicKey}>
                {running ? "Running…" : started ? "Resume" : "Sign & send"}
              </button>
            )}
          </div>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full bg-emerald-500 transition-all" style={{ width: `${(paid / allRows.length) * 100}%` }} />
        </div>
        <p className="mt-2 text-xs text-muted">{paid} of {allRows.length} paid</p>
        {progress && <p className="mt-3 rounded-lg bg-indigo-50 p-3 text-sm text-indigo-800">{progress}</p>}
        {error && <p className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        {!publicKey && needsAction && <p className="mt-3 text-sm text-muted">Connect {short(batch.owner)} to continue.</p>}
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Recipient</th>
              <th className="px-4 py-3">Route</th>
              <th className="px-4 py-3 text-right">Requested</th>
              <th className="px-4 py-3 text-right">Received</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {allRows.map(({ c, r, s }) => (
              <tr key={r.wallet}>
                <td className="px-4 py-3">
                  <div className="font-medium">{r.label || "—"}</div>
                  <a href={explorerAccount(r.wallet, batch.cluster)} target="_blank" rel="noreferrer" className="font-mono text-xs text-muted hover:text-brand">
                    {short(r.wallet)}
                  </a>
                </td>
                <td className="px-4 py-3 text-xs text-muted">
                  #{c.index + 1}
                  {transfers[c.index]?.supportBundleId && <div className="font-mono">{transfers[c.index].supportBundleId}</div>}
                </td>
                <td className="px-4 py-3 text-right font-mono">{formatAmount(r.targetRaw, batch.token.decimals)}</td>
                <td className="px-4 py-3 text-right font-mono">{s.received ? formatAmount(s.received, batch.token.decimals) : "—"}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${TONE[s.tone]}`}>{s.label}</span>
                  {s.signature && (
                    <a href={explorerTx(s.signature, batch.cluster)} target="_blank" rel="noreferrer" className="ml-2 text-xs text-brand hover:underline">
                      tx
                    </a>
                  )}
                  {c.error && <div className="mt-1 text-xs text-rose-700">{c.error}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
