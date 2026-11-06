import "server-only";
import { NextResponse } from "next/server";
import { MhError } from "./mh.ts";
import { sessionWallet } from "./session.ts";

/** Wraps a route handler: requires a signed-in wallet and turns errors into `{ error: { code, message } }`. */
export function authed<Ctx>(fn: (req: Request, wallet: string, ctx: Ctx) => Promise<unknown>) {
  return async (req: Request, ctx: Ctx) => {
    try {
      const wallet = await sessionWallet();
      if (!wallet) return fail(401, "UNAUTHENTICATED", "Sign in with your wallet first");
      return NextResponse.json(await fn(req, wallet, ctx));
    } catch (e) {
      if (e instanceof MhError) return fail(e.status, e.code, e.message);
      console.error(e);
      return fail(500, "INTERNAL", "Unexpected server error");
    }
  };
}

export function fail(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    if (body && typeof body === "object" && !Array.isArray(body)) return body;
  } catch {
    // handled below
  }
  throw new MhError(400, "BAD_JSON", "Request body must be a JSON object");
}
