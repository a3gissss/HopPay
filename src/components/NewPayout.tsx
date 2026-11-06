"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { api, Estimate } from "@/lib/client/api";
import { Batch, saveBatch } from "@/lib/client/batches";
import { formatAmount, grossUp, sum } from "@/lib/amounts";
import { chunk, MAX_DESTINATIONS_PER_ROUTE, parseRecipients } from "@/lib/recipients";
import { cluster, Token, tokensFor } from "@/lib/tokens";

const DELIVERY = [
  { label: "~5 minutes", seconds: 300 },
  { label: "~15 minutes", seconds: 900 },
  { label: "~1 hour", seconds: 3600 },
  { label: "~6 hours", seconds: 21600 },
];

const MAX_ROUTES_PER_BATCH = 25;

const SAMPLE = `wallet,amount,label
7pBqizvE8vQZ29F49NWSu9cho3s7M9SqJyNN1UoQyQ2u,1250,Alice - October design retainer
3UdgSTpcUbiBSmgdPBiVHRMbcDS731kMT6bAQQZgE3c4,800,Bob - backend contract`;

type Review = {
  estimates: Estimate[];
  sendRaw: bigint[];
  tokenSpend: bigint;
  delivered: bigint;
  percentFee: bigint;
  solRequired: bigint;
  solNetCost: bigint;
  solRefundable: bigint;
  solBalance: bigint;
  tokenBalance: bigint;
};

export function NewPayout({ wallet }: { wallet: string }) {
  const router = useRouter();
  const { connection } = useConnection();
  const tokens = tokensFor();
  const [token, setToken] = useState<Token>(tokens[0]);
  const [name, setName] = useState("");
  const [csv, setCsv] = useState("");
  const [hops, setHops] = useState(3);
  const [arrivalSeconds, setArrivalSeconds] = useState(300);
  const [feeCovered, setFeeCovered] = useState(true);
  const [perRoute, setPerRoute] = useState(MAX_DESTINATIONS_PER_ROUTE);
  const [review, setReview] = useState<Review | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const parsed = useMemo(() => parseRecipients(csv, token.decimals), [csv, token.decimals]);
  const groups = useMemo(() => chunk(parsed.recipients, perRoute), [parsed.recipients, perRoute]);
  const total = sum(parsed.recipients.map((r) => r.amountRaw));
  // Grossing up is only exact for SPL tokens; for SOL the per-hop charge also comes out of the amount.
  const grossing = feeCovered && !token.native;

  function invalidate() {
    setReview(null);
    setError(null);
  }

  async function onFile(file: File) {
    setCsv(await file.text());
    invalidate();
  }

  async function runReview() {
    setError(null);
    setReview(null);
    if (groups.length > MAX_ROUTES_PER_BATCH) {
      setError(`Up to ${MAX_ROUTES_PER_BATCH} routes (${MAX_ROUTES_PER_BATCH * perRoute} recipients) per batch. Split the file.`);
      return;
    }
    try {
      const base = { tokenMint: token.mint, tokenDecimals: token.decimals, hops, arrivalSeconds };
      let bps = 50;
      if (grossing) {
        setBusy("Reading the fee schedule");
        bps = (await api.estimate({ ...base, amountRaw: parsed.recipients[0].amountRaw.toString(), destinationCount: 1 }))
          .percentFeeBps;
      }
      const sendRaw = parsed.recipients.map((r) => (grossing ? grossUp(r.amountRaw, bps) : r.amountRaw));

      const estimates: Estimate[] = [];
      let offset = 0;
      for (const [i, g] of groups.entries()) {
        setBusy(`Quoting route ${i + 1} of ${groups.length}`);
        const amount = sum(sendRaw.slice(offset, offset + g.length));
        offset += g.length;
        estimates.push(await api.estimate({ ...base, amountRaw: amount.toString(), destinationCount: g.length }));
      }

      setBusy("Checking balances");
      const owner = new PublicKey(wallet);
      const solBalance = BigInt(await connection.getBalance(owner));
      let tokenBalance = solBalance;
      if (!token.native) {
        const accounts = await connection.getParsedTokenAccountsByOwner(owner, { mint: new PublicKey(token.mint) });
        tokenBalance = sum(accounts.value.map((a) => BigInt(a.account.data.parsed.info.tokenAmount.amount)));
      }

      const tokenSpend = sum(sendRaw);
      const solRequired = sum(estimates.map((e) => BigInt(e.sol.requiredSolUpFrontLamports)));
      setReview({
        estimates,
        sendRaw,
        tokenSpend,
        delivered: sum(estimates.map((e) => BigInt(e.hopAmountRaw))),
        percentFee: sum(estimates.map((e) => BigInt(e.percentFeeRaw))),
        solRequired: token.native && solRequired < tokenSpend ? tokenSpend : solRequired,
        solNetCost: sum(estimates.map((e) => BigInt(e.sol.netCostLamports))),
        solRefundable: sum(estimates.map((e) => BigInt(e.sol.refundableLamports))),
        solBalance,
        tokenBalance,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function start() {
    if (!review) return;
    const batch: Batch = {
      id: crypto.randomUUID(),
      name: name.trim() || `Payout ${new Date().toLocaleDateString()}`,
      createdAt: new Date().toISOString(),
      owner: wallet,
      cluster: cluster(),
      token,
      hops,
      arrivalSeconds,
      feeCoveredBySender: grossing,
      recipients: parsed.recipients.map((r, i) => ({
        wallet: r.wallet,
        label: r.label,
        targetRaw: r.amountRaw.toString(),
        sendRaw: review.sendRaw[i].toString(),
      })),
      chunks: groups.map((g, index) => ({
        index,
        recipients: g.map((r) => parsed.recipients.indexOf(r)),
      })),
    };
    saveBatch(batch);
    router.push(`/batch/${batch.id}`);
  }

  const solShort = review ? review.solBalance < review.solRequired : false;
  const tokenShort = review && !token.native ? review.tokenBalance < review.tokenSpend : false;

  return (
    <section className="card">
      <h2 className="text-lg font-bold">New payout</h2>
      <p className="mt-1 text-sm text-muted">
        Paste or upload a CSV of <code className="font-mono text-xs">wallet, amount, label</code>. Up to{" "}
        {MAX_DESTINATIONS_PER_ROUTE} recipients share one route, so fees and signatures stay low.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="name">Batch name</label>
          <input id="name" className="input" placeholder="October contractors" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="token">Token</label>
          <select
            id="token"
            className="input"
            value={token.mint}
            onChange={(e) => {
              setToken(tokens.find((t) => t.mint === e.target.value)!);
              invalidate();
            }}
          >
            {tokens.map((t) => (
              <option key={t.mint} value={t.mint}>{t.symbol}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-1 flex items-center justify-between">
          <label className="label !mb-0" htmlFor="csv">Recipients</label>
          <div className="flex gap-2 text-xs">
            <button type="button" className="text-brand hover:underline" onClick={() => { setCsv(SAMPLE); invalidate(); }}>
              Use sample
            </button>
            <label className="cursor-pointer text-brand hover:underline">
              Upload CSV
              <input type="file" accept=".csv,.tsv,.txt" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
            </label>
          </div>
        </div>
        <textarea
          id="csv"
          className="input h-40 font-mono text-xs"
          placeholder={SAMPLE}
          value={csv}
          onChange={(e) => { setCsv(e.target.value); invalidate(); }}
          spellCheck={false}
        />
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          <span>{parsed.recipients.length} recipients</span>
          <span>{formatAmount(total, token.decimals)} {token.symbol}</span>
          <span>{groups.length} route{groups.length === 1 ? "" : "s"}</span>
        </div>
        {parsed.errors.length > 0 && (
          <ul className="mt-2 max-h-28 overflow-auto rounded-lg bg-rose-50 p-2 text-xs text-rose-700">
            {parsed.errors.map((e) => (
              <li key={e.line}>Line {e.line}: {e.message}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-4">
        <div>
          <label className="label" htmlFor="per-route">Routing</label>
          <select id="per-route" className="input" value={perRoute} onChange={(e) => { setPerRoute(Number(e.target.value)); invalidate(); }}>
            <option value={MAX_DESTINATIONS_PER_ROUTE}>Grouped (20/route)</option>
            <option value={1}>One route each</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="hops">Hops</label>
          <select id="hops" className="input" value={hops} onChange={(e) => { setHops(Number(e.target.value)); invalidate(); }}>
            {[3, 4, 5, 6, 7, 8, 9, 10].map((h) => <option key={h} value={h}>{h} hops</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="arrival">Delivery</label>
          <select id="arrival" className="input" value={arrivalSeconds} onChange={(e) => { setArrivalSeconds(Number(e.target.value)); invalidate(); }}>
            {DELIVERY.map((d) => <option key={d.seconds} value={d.seconds}>{d.label}</option>)}
          </select>
        </div>
        <label className={`flex items-end gap-2 pb-2 text-sm ${token.native ? "opacity-50" : ""}`}>
          <input
            type="checkbox"
            className="h-4 w-4 accent-brand"
            checked={grossing}
            disabled={token.native}
            onChange={(e) => { setFeeCovered(e.target.checked); invalidate(); }}
          />
          I cover the 0.5% fee
        </label>
      </div>

      {error && <p className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

      {review && (
        <div className="mt-5 rounded-xl border border-line bg-slate-50 p-4 text-sm">
          <h3 className="font-semibold">Review</h3>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2">
            <dt className="text-muted">Recipients receive</dt>
            <dd className="text-right font-mono">{formatAmount(review.delivered, token.decimals)} {token.symbol}</dd>
            <dt className="text-muted">MultiHopper fee (0.5%)</dt>
            <dd className="text-right font-mono">{formatAmount(review.percentFee, token.decimals)} {token.symbol}</dd>
            <dt className="text-muted">You send</dt>
            <dd className="text-right font-mono font-semibold">{formatAmount(review.tokenSpend, token.decimals)} {token.symbol}</dd>
            <dt className="text-muted">SOL needed up front</dt>
            <dd className="text-right font-mono">{formatAmount(review.solRequired, 9, 4)} SOL</dd>
            <dt className="text-muted">SOL cost after rent refunds</dt>
            <dd className="text-right font-mono">{formatAmount(review.solNetCost - (token.native ? review.tokenSpend : 0n), 9, 4)} SOL</dd>
          </dl>
          <p className={`mt-3 text-xs ${solShort || tokenShort ? "text-rose-700" : "text-emerald-700"}`}>
            Wallet holds {formatAmount(review.solBalance, 9, 4)} SOL
            {!token.native && <> and {formatAmount(review.tokenBalance, token.decimals)} {token.symbol}</>}.
            {solShort && " Not enough SOL for rent, fees and screening."}
            {tokenShort && ` Not enough ${token.symbol}.`}
            {!solShort && !tokenShort && " Enough to run this batch."}
          </p>
          <p className="mt-2 text-xs text-muted">
            Every route is screened by TRM Labs before funds move. If a wallet is flagged, that route's principal is refunded to you.
            You approve {groups.length > 1 ? `about ${groups.length * 2} wallet prompts (two per route)` : "two wallet prompts"}.
          </p>
        </div>
      )}

      <div className="mt-5 flex flex-wrap justify-end gap-2">
        {!review ? (
          <button className="btn" disabled={!!busy || parsed.recipients.length === 0 || parsed.errors.length > 0} onClick={runReview}>
            {busy ?? "Review costs"}
          </button>
        ) : (
          <>
            <button className="btn-ghost" onClick={invalidate}>Edit</button>
            <button className="btn" disabled={solShort || tokenShort} onClick={start}>
              Start payout of {formatAmount(review.tokenSpend, token.decimals)} {token.symbol}
            </button>
          </>
        )}
      </div>
      {token.native && <p className="mt-2 text-right text-xs text-muted">Each SOL recipient must receive at least ~0.00089 SOL (rent minimum).</p>}
    </section>
  );
}
