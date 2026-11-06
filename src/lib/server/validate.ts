import "server-only";
import { MhError } from "./mh.ts";
import { isSolanaAddress, MAX_DESTINATIONS_PER_ROUTE } from "../recipients.ts";

// Only the fields our product uses are forwarded to MultiHopper, after validation.

function bad(message: string): never {
  throw new MhError(400, "INVALID_REQUEST", message);
}

export function address(v: unknown, name: string): string {
  if (typeof v !== "string" || !isSolanaAddress(v)) bad(`${name} must be a Solana address`);
  return v;
}

export function int(v: unknown, name: string, min: number, max: number): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) bad(`${name} must be an integer ${min}-${max}`);
  return v;
}

export function rawAmount(v: unknown, name: string): bigint {
  if (typeof v !== "string" || !/^[1-9]\d{0,29}$/.test(v)) bad(`${name} must be a positive integer string`);
  return BigInt(v);
}

export function symbol(v: unknown): string | undefined {
  if (v === undefined) return undefined;
  if (typeof v !== "string" || !/^[A-Za-z0-9.$-]{1,12}$/.test(v)) bad("tokenSymbol is invalid");
  return v;
}

export function ref(v: unknown, name: string): string {
  if (typeof v !== "string" || !/^[A-Za-z0-9-]{8,40}$/.test(v)) bad(`${name} is invalid`);
  return v;
}

export type DestinationIn = { wallet: string; amountRaw: bigint };

export function destinations(v: unknown): DestinationIn[] {
  if (!Array.isArray(v) || v.length < 1 || v.length > MAX_DESTINATIONS_PER_ROUTE) {
    bad(`recipients must have 1-${MAX_DESTINATIONS_PER_ROUTE} entries`);
  }
  const seen = new Set<string>();
  return v.map((d, i) => {
    const wallet = address(d?.wallet, `recipients[${i}].wallet`);
    if (seen.has(wallet)) bad(`recipients[${i}].wallet is a duplicate`);
    seen.add(wallet);
    return { wallet, amountRaw: rawAmount(d?.amountRaw, `recipients[${i}].amountRaw`) };
  });
}
