import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSignInMessageText } from "@solana/wallet-standard-util";
import { buildLoginMessage, LOGIN_TTL_MS } from "./siws.ts";

const WALLET = "7pBqizvE8vQZ29F49NWSu9cho3s7M9SqJyNN1UoQyQ2u";
const NONCE = "019a5b3c7d2e8f01a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7";
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

test("login message round-trips through the Solana wallet-standard parser", () => {
  const at = Date.UTC(2026, 10, 6, 9, 0, 0);
  const parsed = parseSignInMessageText(buildLoginMessage(WALLET, NONCE, "http://localhost:3000", at));
  assert.ok(parsed);
  assert.equal(parsed.domain, "localhost:3000");
  assert.equal(parsed.address, WALLET);
  assert.match(parsed.statement ?? "", /^Sign in to HopPay/);
  assert.equal(parsed.uri, "http://localhost:3000");
  assert.equal(parsed.version, "1");
  assert.equal(parsed.nonce, NONCE);
  assert.equal(parsed.issuedAt, new Date(at).toISOString());
  assert.equal(parsed.expirationTime, new Date(at + LOGIN_TTL_MS).toISOString());
});

test("login message meets the stricter field rules wallets enforce", () => {
  const parsed = parseSignInMessageText(buildLoginMessage(WALLET, NONCE, "https://hoppay.example", Date.now()));
  assert.ok(parsed);
  assert.match(parsed.nonce ?? "", /^[a-zA-Z0-9]{8,}$/);
  assert.match(parsed.issuedAt ?? "", ISO);
  assert.match(parsed.expirationTime ?? "", ISO);
  assert.equal(parsed.domain, "hoppay.example");
  assert.ok(!(parsed.statement ?? "").includes("\n"));
});
