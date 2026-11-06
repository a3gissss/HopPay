// Browser -> our /api routes. Errors carry MultiHopper's MH_xxx code so the UI can react to them.

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(path, {
    method: init?.method ?? (init?.body === undefined ? "GET" : "POST"),
    headers: init?.body === undefined ? undefined : { "content-type": "application/json" },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    credentials: "same-origin",
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, json?.error?.code ?? `HTTP_${res.status}`, json?.error?.message ?? res.statusText);
  }
  return json as T;
}

export type Destination = {
  wallet: string;
  amountRaw: string;
  status: "pending" | "paid";
  payoutSignature: string | null;
  paidAt: string | null;
};

export type TransferStatus =
  | "quote"
  | "awaiting_signature"
  | "processing"
  | "active"
  | "completed"
  | "failed"
  | "expired"
  | "refunded";

export type Transfer = {
  id: number;
  externalId?: string;
  supportBundleId?: string;
  status: TransferStatus;
  phase?: string;
  sourceOwner: string;
  recipientWallet: string | null;
  destinations: Destination[] | null;
  amountRaw: string;
  recipientReceivesRaw?: string;
  percentFeeRaw?: string;
  totalFlatFeeLamports?: number;
  progress?: { hopsCompleted: number; hopsTotal: number };
  lastError?: { code: string; message: string; at: string } | null;
  signatures?: { routeInit: string[]; sessionInit: string[]; hops: string[] };
  route?: { hops: { index: number; executedAt: string | null; txSignature: string | null }[] };
  expiresAt?: string;
};

export type Estimate = {
  tier: string;
  percentFeeBps: number;
  percentFeeRaw: string;
  totalFlatFeeLamports: number;
  hopAmountRaw: string;
  usdEquivalent: number;
  priceSource: string;
  tokens: { amountRaw: string; feeRaw: string; netDeliveredRaw: string; decimals: number };
  sol: {
    requiredSolUpFrontLamports: number;
    refundableLamports: number;
    netCostLamports: number;
    breakdown: Record<string, number>;
  };
};

export type PreparedTxs = {
  keeperFundingTx: string | null;
  routeInitTxs: { base64: string }[];
  orchestratorInitTx: string | null;
  sessionInitTxs: string[];
  dispersionInitTxs?: string[];
  recentBlockhash: string;
  lastValidBlockHeight: number;
  resume: { nothingToDo: boolean };
};

export type ConfirmBody = {
  routeInitSignatures: string[];
  keeperFundingSignature?: string;
  orchestratorInitSignature?: string;
  sessionInitSignatures?: string[];
  dispersionInitSignatures?: string[];
};

export const api = {
  me: () => call<{ wallet: string | null }>("/api/auth/me"),
  nonce: (wallet: string) => call<{ nonce: string; message: string }>("/api/auth/nonce", { body: { wallet } }),
  verify: (wallet: string, nonce: string, signature: string) =>
    call<{ wallet: string }>("/api/auth/verify", { body: { wallet, nonce, signature } }),
  logout: () => call<{ wallet: null }>("/api/auth/me", { method: "DELETE" }),

  estimate: (body: {
    tokenMint: string;
    tokenDecimals: number;
    amountRaw: string;
    hops: number;
    arrivalSeconds: number;
    destinationCount: number;
  }) => call<Estimate>("/api/transfers/estimate", { body }),

  create: (body: {
    batchId: string;
    index: number;
    tokenMint: string;
    tokenDecimals: number;
    tokenSymbol: string;
    hops: number;
    arrivalSeconds: number;
    recipients: { wallet: string; amountRaw: string }[];
  }) => call<Transfer>("/api/transfers", { body }),

  get: (id: number) => call<Transfer>(`/api/transfers/${id}`),
  prepare: (id: number) => call<{ transfer: Transfer; preparedTxs: PreparedTxs }>(`/api/transfers/${id}/prepare`, { body: {} }),
  confirm: (id: number, body: ConfirmBody) =>
    call<{ transfer: Transfer }>(`/api/transfers/${id}/confirm-broadcast`, { body }),
};

export const TERMINAL: TransferStatus[] = ["completed", "failed", "expired", "refunded"];
export const DEPLOYED: TransferStatus[] = ["processing", "active", "completed"];
