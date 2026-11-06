// Exact decimal <-> base-unit conversion. Never route token amounts through JS floats.

export function parseAmount(input: string, decimals: number): bigint {
  const s = input.trim().replace(/_/g, "");
  if (!/^\d+(\.\d+)?$/.test(s) && !/^\.\d+$/.test(s)) {
    throw new Error(`"${input}" is not a valid amount`);
  }
  const [whole = "0", frac = ""] = s.split(".");
  if (frac.length > decimals) {
    throw new Error(`"${input}" has more than ${decimals} decimal places`);
  }
  return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, "0") || "0");
}

export function formatAmount(raw: bigint | string, decimals: number, maxFraction = decimals): string {
  const v = typeof raw === "bigint" ? raw : BigInt(raw);
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  let frac = (abs % base).toString().padStart(decimals, "0").slice(0, maxFraction).replace(/0+$/, "");
  const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${neg ? "-" : ""}${wholeStr}${frac ? "." + frac : ""}`;
}

/** Plain decimal string with no grouping, e.g. for MultiHopper's `amountTokens`. */
export function toDecimalString(raw: bigint, decimals: number): string {
  return formatAmount(raw, decimals).replace(/,/g, "");
}

export function sum(values: Iterable<bigint>): bigint {
  let total = 0n;
  for (const v of values) total += v;
  return total;
}

/**
 * Amount the sender must route so a recipient nets roughly `target` after the percent fee.
 * MultiHopper charges floor(hop * bps / 10000) on top of the hop amount, so rounding the fee up
 * makes the recipient land on `target` or at most a base unit above it.
 */
export function grossUp(target: bigint, percentFeeBps: number): bigint {
  const bps = BigInt(percentFeeBps);
  return target + (target * bps + 9999n) / 10000n;
}
