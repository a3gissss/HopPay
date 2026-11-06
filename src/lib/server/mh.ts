import "server-only";
import { randomUUID } from "node:crypto";

// Thin MultiHopper REST client. The API key stays on the server; the browser only ever talks to
// our own /api routes, which check that the signed-in wallet owns the transfer being touched.

export class MhError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

function config() {
  const key = process.env.MH_API_KEY;
  const base = process.env.MH_BASE_URL;
  if (!key || !base) throw new MhError(500, "CONFIG", "MH_API_KEY and MH_BASE_URL must be set");
  return { key, base: base.replace(/\/$/, "") };
}

type Options = { method?: "GET" | "POST" | "DELETE"; body?: unknown; idempotencyKey?: string };

export async function mh<T = any>(path: string, { method = "GET", body, idempotencyKey }: Options = {}): Promise<T> {
  const { key, base } = config();
  const headers: Record<string, string> = { "x-api-key": key, accept: "application/json" };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (method === "POST") headers["idempotency-key"] = idempotencyKey ?? randomUUID();

  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // fall through with raw text
  }
  if (!res.ok) {
    const err = json?.error;
    throw new MhError(res.status, err?.code ?? `HTTP_${res.status}`, err?.message ?? (text.slice(0, 300) || res.statusText));
  }
  return json as T;
}

/** Fetches a transfer and throws 404 unless `wallet` is its sourceOwner. */
export async function getOwnedTransfer(id: string, wallet: string) {
  if (!/^\d{1,12}$/.test(id)) throw new MhError(400, "BAD_ID", "Invalid transfer id");
  const transfer = await mh(`/transfers/${id}`);
  if (transfer?.sourceOwner !== wallet) {
    // Same answer as a missing transfer, so ids can't be probed.
    throw new MhError(404, "MH_030", "Transfer not found");
  }
  return transfer;
}
