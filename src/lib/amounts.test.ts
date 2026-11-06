import { test } from "node:test";
import assert from "node:assert/strict";
import { formatAmount, grossUp, parseAmount } from "./amounts.ts";
import { chunk, parseRecipients } from "./recipients.ts";

test("parseAmount is exact", () => {
  assert.equal(parseAmount("1", 6), 1_000_000n);
  assert.equal(parseAmount("0.000001", 6), 1n);
  assert.equal(parseAmount("1234.5", 6), 1_234_500_000n);
  assert.equal(parseAmount(".5", 9), 500_000_000n);
  assert.throws(() => parseAmount("0.0000001", 6));
  assert.throws(() => parseAmount("1e3", 6));
  assert.throws(() => parseAmount("-1", 6));
  assert.throws(() => parseAmount("", 6));
});

test("formatAmount", () => {
  assert.equal(formatAmount(1_234_500_000n, 6), "1,234.5");
  assert.equal(formatAmount("1", 6), "0.000001");
  assert.equal(formatAmount(0n, 6), "0");
  assert.equal(formatAmount(1_999_999n, 6, 2), "1.99");
});

test("grossUp nets at least the target after a floor()ed percent fee", () => {
  for (const target of [1n, 199n, 1_000_000n, 123_456_789n, 2_500_000_000n]) {
    const amount = grossUp(target, 50);
    // MultiHopper: fee = floor(hop * bps / 10000), hop + fee <= amount. Largest hop that fits:
    let hop = (amount * 10000n) / 10050n;
    while (hop + (hop + 1n) * 50n / 10000n + 1n <= amount) hop++;
    assert.ok(hop >= target, `target ${target} got ${hop}`);
    assert.ok(hop - target <= 1n, `target ${target} overshot to ${hop}`);
  }
});

const A = "7pBqizvE8vQZ29F49NWSu9cho3s7M9SqJyNN1UoQyQ2u";
const B = "3UdgSTpcUbiBSmgdPBiVHRMbcDS731kMT6bAQQZgE3c4";

test("parseRecipients reads CSV with header, labels and reports every error", () => {
  const { recipients, errors } = parseRecipients(
    ["wallet,amount,label", `${A},12.5,Alice - design`, `${B}\t3`, "nope,1", `${A},1`, `${B},abc`].join("\n"),
    6,
  );
  assert.deepEqual(
    recipients.map((r) => [r.wallet, r.amountRaw, r.label]),
    [
      [A, 12_500_000n, "Alice - design"],
      [B, 3_000_000n, ""],
    ],
  );
  assert.deepEqual(
    errors.map((e) => e.line),
    [4, 5, 6],
  );
});

test("chunk", () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
});
