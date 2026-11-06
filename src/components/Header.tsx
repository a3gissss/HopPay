"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useSession } from "@/app/providers";
import { cluster } from "@/lib/tokens";

// The wallet button reads window state, so render it client-side only.
const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false },
);

export function Header() {
  const { wallet, signOut } = useSession();
  const c = cluster();
  return (
    <header className="border-b border-line bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-bold tracking-tight">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-white">H</span>
          <span>HopPay</span>
          <span
            className={`ml-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              c === "devnet" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
            }`}
          >
            {c === "devnet" ? "Devnet" : "Mainnet"}
          </span>
        </Link>
        <div className="flex items-center gap-2">
          {wallet && (
            <button className="btn-ghost hidden sm:inline-flex" onClick={signOut}>
              Sign out
            </button>
          )}
          <WalletMultiButton />
        </div>
      </div>
    </header>
  );
}
