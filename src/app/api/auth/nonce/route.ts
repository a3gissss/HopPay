import { NextResponse } from "next/server";
import { fail, readJson } from "@/lib/server/handler";
import { issueNonce, loginMessage } from "@/lib/server/session";
import { isSolanaAddress } from "@/lib/recipients";

export async function POST(req: Request) {
  const body = await readJson(req).catch(() => ({}) as Record<string, unknown>);
  const wallet = body.wallet;
  if (typeof wallet !== "string" || !isSolanaAddress(wallet)) return fail(400, "INVALID_REQUEST", "wallet is required");
  const nonce = issueNonce();
  return NextResponse.json({ nonce, message: loginMessage(wallet, nonce, new URL(req.url).origin) });
}
