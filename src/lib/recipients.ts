import bs58 from "bs58";
import { parseAmount } from "./amounts.ts";

export type Recipient = {
  line: number;
  wallet: string;
  amountRaw: bigint;
  label: string;
};

export type ParseResult = {
  recipients: Recipient[];
  errors: { line: number; message: string }[];
};

/** MultiHopper accepts at most 20 destinations per route. */
export const MAX_DESTINATIONS_PER_ROUTE = 20;

export function isSolanaAddress(value: string): boolean {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)) return false;
  try {
    return bs58.decode(value).length === 32;
  } catch {
    return false;
  }
}

/**
 * Parses pasted CSV/TSV rows of `wallet, amount[, label]`. A header row is skipped.
 * Every problem is reported with its line number so the user can fix them all at once.
 */
export function parseRecipients(text: string, decimals: number): ParseResult {
  const recipients: Recipient[] = [];
  const errors: ParseResult["errors"] = [];
  const seen = new Map<string, number>();

  text.split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1;
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("#")) return;

    const cells = trimmed.split(/[,;\t]/).map((c) => c.trim().replace(/^"|"$/g, ""));
    const [wallet = "", amount = "", ...rest] = cells;

    if (recipients.length === 0 && errors.length === 0 && /wallet|address|recipient/i.test(wallet)) {
      return; // header
    }
    if (!isSolanaAddress(wallet)) {
      errors.push({ line, message: `"${wallet}" is not a Solana address` });
      return;
    }
    let amountRaw: bigint;
    try {
      amountRaw = parseAmount(amount, decimals);
    } catch (e) {
      errors.push({ line, message: (e as Error).message });
      return;
    }
    if (amountRaw <= 0n) {
      errors.push({ line, message: "amount must be greater than zero" });
      return;
    }
    const prev = seen.get(wallet);
    if (prev !== undefined) {
      errors.push({ line, message: `duplicate of line ${prev}; merge the two rows into one` });
      return;
    }
    seen.set(wallet, line);
    recipients.push({ line, wallet, amountRaw, label: rest.join(", ").slice(0, 80) });
  });

  return { recipients, errors };
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
