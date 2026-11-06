"use client";

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ConnectionProvider, useWallet, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { BraveWalletAdapter } from "@solana/wallet-adapter-brave";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { clusterApiUrl } from "@solana/web3.js";
import bs58 from "bs58";
import { api } from "@/lib/client/api";
import { cluster } from "@/lib/tokens";

type Session = {
  /** Wallet that holds a valid server session and matches the connected wallet. */
  wallet: string | null;
  ready: boolean;
  signingIn: boolean;
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const s = useContext(SessionContext);
  if (!s) throw new Error("useSession outside <Providers>");
  return s;
}

function SessionProvider({ children }: { children: ReactNode }) {
  const { publicKey, signMessage, disconnect } = useWallet();
  const [serverWallet, setServerWallet] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .me()
      .then((r) => setServerWallet(r.wallet))
      .catch(() => setServerWallet(null))
      .finally(() => setReady(true));
  }, []);

  const connected = publicKey?.toBase58() ?? null;

  const signIn = useCallback(async () => {
    if (!connected || !signMessage) {
      setError("This wallet cannot sign messages. Try Phantom, Solflare or Backpack.");
      return;
    }
    setSigningIn(true);
    setError(null);
    try {
      const { nonce, message } = await api.nonce(connected);
      const signature = await signMessage(new TextEncoder().encode(message));
      const r = await api.verify(connected, nonce, bs58.encode(signature));
      setServerWallet(r.wallet);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSigningIn(false);
    }
  }, [connected, signMessage]);

  const signOut = useCallback(async () => {
    await api.logout().catch(() => undefined);
    setServerWallet(null);
    await disconnect().catch(() => undefined);
  }, [disconnect]);

  const value = useMemo<Session>(
    () => ({
      wallet: connected && connected === serverWallet ? connected : null,
      ready,
      signingIn,
      error,
      signIn,
      signOut,
    }),
    [connected, serverWallet, ready, signingIn, error, signIn, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function Providers({ children }: { children: ReactNode }) {
  const endpoint = process.env.NEXT_PUBLIC_RPC_URL || clusterApiUrl(cluster());
  // Listed so the picker is never empty: a missing wallet links to its install page.
  // Other Wallet Standard wallets (Backpack...) still register themselves.
  const wallets = useMemo(() => [new PhantomWalletAdapter(), new SolflareWalletAdapter(), new BraveWalletAdapter()], []);
  return (
    <ConnectionProvider endpoint={endpoint} config={{ commitment: "confirmed" }}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <SessionProvider>{children}</SessionProvider>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
