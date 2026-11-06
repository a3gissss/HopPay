"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useSession } from "./providers";
import { NewPayout } from "@/components/NewPayout";
import { BatchList } from "@/components/BatchList";

const POINTS = [
  ["One CSV, many recipients", "Pay up to 500 wallets per batch. 20 recipients share each route, so you sign a handful of prompts instead of hundreds."],
  ["Compliance by default", "Every sender, hop and recipient is screened by TRM Labs at the smart-contract level before funds move."],
  ["Payroll-grade receipts", "Track every payout to its on-chain signature and export a receipt CSV for your books."],
];

export default function Home() {
  const { publicKey } = useWallet();
  const { setVisible } = useWalletModal();
  const { wallet, ready, signIn, signingIn, error } = useSession();

  if (wallet) {
    return (
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <NewPayout wallet={wallet} />
        <BatchList wallet={wallet} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl py-10 text-center">
      <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">Pay your team in USDC, from one file.</h1>
      <p className="mx-auto mt-4 max-w-xl text-lg text-muted">
        Batch payouts for contractors, contributors and suppliers on Solana, routed through MultiHopper so your
        treasury wallet isn&apos;t a one-hop lookup away from everyone you pay.
      </p>
      <div className="mt-8 flex justify-center">
        {!publicKey ? (
          <button className="btn px-6 py-3 text-base" onClick={() => setVisible(true)}>Connect wallet</button>
        ) : (
          <button className="btn px-6 py-3 text-base" disabled={!ready || signingIn} onClick={signIn}>
            {signingIn ? "Check your wallet..." : "Sign in with wallet"}
          </button>
        )}
      </div>
      {error && <p className="mt-3 text-sm text-rose-700">{error}</p>}
      <div className="mt-14 grid gap-4 text-left sm:grid-cols-3">
        {POINTS.map(([title, body]) => (
          <div key={title} className="card">
            <h3 className="font-semibold">{title}</h3>
            <p className="mt-1 text-sm text-muted">{body}</p>
          </div>
        ))}
      </div>
      <p className="mt-8 text-xs text-muted">
        Routing reduces simple linkage between payer and payee. It does not erase on-chain history or guarantee anonymity.
      </p>
    </div>
  );
}
