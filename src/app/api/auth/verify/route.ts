import { NextResponse } from "next/server";
import { fail, readJson } from "@/lib/server/handler";
import { startSession, verifyLogin } from "@/lib/server/session";

export async function POST(req: Request) {
  const body = await readJson(req).catch(() => ({}) as Record<string, unknown>);
  const { wallet, nonce, signature } = body;
  if (typeof wallet !== "string" || typeof nonce !== "string" || typeof signature !== "string") {
    return fail(400, "INVALID_REQUEST", "wallet, nonce and signature are required");
  }
  if (!verifyLogin(wallet, nonce, new URL(req.url).origin, signature)) {
    return fail(401, "BAD_SIGNATURE", "Signature could not be verified, or the sign-in request expired");
  }
  await startSession(wallet);
  return NextResponse.json({ wallet });
}
