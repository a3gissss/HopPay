export type Cluster = "devnet" | "mainnet-beta";

export type Token = {
  mint: string;
  symbol: string;
  decimals: number;
  /** Native SOL: fees and rent come out of the same balance. */
  native?: boolean;
};

export const SOL: Token = {
  mint: "So11111111111111111111111111111111111111112",
  symbol: "SOL",
  decimals: 9,
  native: true,
};

const TOKENS: Record<Cluster, Token[]> = {
  "mainnet-beta": [
    { mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", symbol: "USDC", decimals: 6 },
    { mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", symbol: "USDT", decimals: 6 },
    { mint: "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo", symbol: "PYUSD", decimals: 6 },
    SOL,
  ],
  devnet: [
    { mint: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU", symbol: "USDC", decimals: 6 },
    SOL,
  ],
};

export function cluster(): Cluster {
  return process.env.NEXT_PUBLIC_SOLANA_CLUSTER === "mainnet-beta" ? "mainnet-beta" : "devnet";
}

export function tokensFor(c: Cluster = cluster()): Token[] {
  return TOKENS[c];
}

export function explorerTx(signature: string, c: Cluster = cluster()): string {
  return `https://solscan.io/tx/${signature}${c === "devnet" ? "?cluster=devnet" : ""}`;
}

export function explorerAccount(address: string, c: Cluster = cluster()): string {
  return `https://solscan.io/account/${address}${c === "devnet" ? "?cluster=devnet" : ""}`;
}
