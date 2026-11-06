import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { isSolanaAddress } from "../recipients.ts";
import { buildLoginMessage, LOGIN_TTL_MS } from "../siws.ts";

// Sign-in with a Solana wallet. Stateless: the nonce and the session cookie are both HMAC-signed,
// so no database is needed.

const COOKIE = "hp_session";
const SESSION_TTL_S = 12 * 60 * 60;
// Nonce layout, hex only because wallets reject anything but letters and digits:
// 12 chars issue time + 16 chars random + 40 chars MAC.
const NONCE = /^([0-9a-f]{12})([0-9a-f]{16})([0-9a-f]{40})$/;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set (32+ chars)");
  return s;
}

function mac(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function nonceMac(body: string): string {
  return createHmac("sha256", secret()).update(`nonce:${body}`).digest("hex").slice(0, 40);
}

export function issueNonce(): string {
  const body = Date.now().toString(16).padStart(12, "0") + randomBytes(8).toString("hex");
  return body + nonceMac(body);
}

/** The exact text the wallet signs. The issue time comes from the nonce, so verify can rebuild it. */
export function loginMessage(wallet: string, nonce: string, origin: string): string {
  return buildLoginMessage(wallet, nonce, origin, parseInt(nonce.slice(0, 12), 16));
}

export function verifyLogin(wallet: string, nonce: string, origin: string, signatureB58: string): boolean {
  if (!isSolanaAddress(wallet)) return false;
  const m = NONCE.exec(nonce);
  if (!m || !safeEqual(m[3], nonceMac(m[1] + m[2]))) return false;
  if (Date.now() - parseInt(m[1], 16) > LOGIN_TTL_MS) return false;
  try {
    const message = new TextEncoder().encode(loginMessage(wallet, nonce, origin));
    return nacl.sign.detached.verify(message, bs58.decode(signatureB58), bs58.decode(wallet));
  } catch {
    return false;
  }
}

export async function startSession(wallet: string) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_S;
  const body = `${wallet}.${exp}`;
  (await cookies()).set(COOKIE, `${body}.${mac(`session:${body}`)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_S,
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

/** The signed-in wallet, or null. */
export async function sessionWallet(): Promise<string | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const [wallet, exp, sig] = raw.split(".");
  if (!wallet || !exp || !sig) return null;
  if (!safeEqual(sig, mac(`session:${wallet}.${exp}`))) return null;
  if (Number(exp) < Date.now() / 1000) return null;
  return wallet;
}
