// Sign In With Solana message text. Wallets parse anything shaped like this strictly and refuse to
// show it if a field is malformed (Phantom: "invalid formatting"), so the layout and the nonce
// alphabet are not negotiable: the nonce must be 8+ letters and digits.

export const LOGIN_TTL_MS = 5 * 60 * 1000;

const STATEMENT = "Sign in to HopPay to create and track payouts. This does not move funds or cost gas.";

export function buildLoginMessage(wallet: string, nonce: string, origin: string, issuedAtMs: number): string {
  return [
    `${new URL(origin).host} wants you to sign in with your Solana account:`,
    wallet,
    "",
    STATEMENT,
    "",
    `URI: ${origin}`,
    "Version: 1",
    `Nonce: ${nonce}`,
    `Issued At: ${new Date(issuedAtMs).toISOString()}`,
    `Expiration Time: ${new Date(issuedAtMs + LOGIN_TTL_MS).toISOString()}`,
  ].join("\n");
}
