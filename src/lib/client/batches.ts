import type { Token } from "../tokens.ts";
import type { Cluster } from "../tokens.ts";

// A payout batch is our product-level object: many recipients, split into MultiHopper transfers of
// up to 20 destinations each. MultiHopper holds the transfers; the batch layout lives in the
// payer's browser so no database is needed. Transfers can always be found again by externalId.

export type BatchRecipient = {
  wallet: string;
  label: string;
  /** What the user typed: the amount the recipient should get. */
  targetRaw: string;
  /** What is routed for them (targetRaw, or grossed up to cover the fee). */
  sendRaw: string;
};

export type BatchChunk = {
  index: number;
  recipients: number[];
  transferId?: number;
  /** Bumped when an expired/failed route is re-quoted, so it gets a fresh externalId. */
  attempt?: number;
  status?: string;
  error?: string;
};

export type Batch = {
  id: string;
  name: string;
  createdAt: string;
  owner: string;
  cluster: Cluster;
  token: Token;
  hops: number;
  arrivalSeconds: number;
  feeCoveredBySender: boolean;
  recipients: BatchRecipient[];
  chunks: BatchChunk[];
};

const KEY = "hoppay.batches.v1";

function readAll(): Batch[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

function writeAll(batches: Batch[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(batches));
  } catch {
    // Storage full or blocked: the transfers still exist at MultiHopper.
  }
}

export function listBatches(owner: string): Batch[] {
  return readAll()
    .filter((b) => b.owner === owner)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getBatch(id: string): Batch | undefined {
  return readAll().find((b) => b.id === id);
}

export function saveBatch(batch: Batch) {
  const all = readAll().filter((b) => b.id !== batch.id);
  writeAll([batch, ...all]);
}

export function updateChunk(batchId: string, index: number, patch: Partial<BatchChunk>): Batch | undefined {
  const batch = getBatch(batchId);
  if (!batch) return undefined;
  batch.chunks = batch.chunks.map((c) => (c.index === index ? { ...c, ...patch } : c));
  saveBatch(batch);
  return batch;
}
