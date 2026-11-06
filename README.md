# HopPay

Stablecoin batch payouts on Solana, routed through [MultiHopper](https://dev-docs.multihopper.com/).

Teams paying contractors, contributors and suppliers in USDC upload one CSV, review the exact cost, and
approve a few wallet prompts. Payouts go through MultiHopper multi-hop routes (up to 20 recipients per
route), so the treasury wallet isn't one hop from everyone it pays. Every route is screened by TRM Labs
on-chain. Every payout links to its on-chain signature, and the batch exports as a receipt CSV.

Built for the [MultiHopper Build & Route Challenge](https://superteam.fun/earn/listing/multihopper-build-and-route-challenge-up-to-dollar50000-revenue-share-1).

## How it works

```
CSV ──parse──▶ recipients ──split by 20──▶ routes
                                             │  POST /transfers/estimate  (per route: fees, SOL up front)
                                             ▼
                               POST /transfers (destinations[])  externalId = hp_<batch>_<n>
                                             │
             POST /prepare ─▶ sign keeperFundingTx ─▶ send ─▶ POST /confirm-broadcast (intermediate)
             POST /prepare ─▶ sign route txs (one prompt) ─▶ send in order ─▶ POST /confirm-broadcast
                                             │
                    poll GET /transfers/:id  ─▶ per-destination paid / payoutSignature ─▶ receipt CSV
```

- **The API key stays server-side.** The browser calls `/api/*`. Those routes require a wallet-signed
  session and only touch transfers whose `sourceOwner` is the signed-in wallet.
- **Resumable.** `/prepare` drops anything already on chain, so a declined prompt, an expired blockhash
  or a closed tab is fixed by pressing **Resume**. `externalId` is deterministic per route, so
  re-creating a route returns the same transfer instead of a duplicate.
- **"I cover the fee".** For SPL tokens, amounts are grossed up so each recipient receives what the CSV
  says (to within one base unit).
- **No database.** MultiHopper stores the transfers. The batch layout is kept in the payer's browser.

## Run locally (devnet)

1. Get a devnet key (`mh_test_…`) at https://devnet.multihopper.com/developer/dashboard and set your
   rewards wallet there. Fund that wallet with at least the rent-exempt minimum (~0.00089 SOL), or
   `/prepare` returns `MH_091`.
2. `cp .env.example .env.local` and fill in `MH_API_KEY` and `SESSION_SECRET`.
3. Install and start:

   ```bash
   npm install
   npm run dev
   ```

4. Open http://localhost:3000, switch your wallet to devnet, fund it with devnet SOL, and pay a batch.
   Devnet USDC: https://faucet.circle.com.

## Go to production

- Create a `mh_live_` key on https://multihopper.com/developer/dashboard and set
  `MH_BASE_URL=https://multihopper.com/api/v1`, `NEXT_PUBLIC_SOLANA_CLUSTER=mainnet-beta`, and a
  paid RPC endpoint in `NEXT_PUBLIC_RPC_URL`.
- Deploy (for example to Vercel), then register the webhook:

  ```bash
  curl -X POST https://multihopper.com/api/v1/webhooks \
    -H "x-api-key: $MH_API_KEY" -H "Content-Type: application/json" -H "Idempotency-Key: $(uuidgen)" \
    -d '{"url":"https://<your-domain>/api/webhooks/multihopper"}'
  ```

  Put the returned `whsec_…` value in `MH_WEBHOOK_SECRET`.
- Mainnet adds TRM screening: 0.002 SOL per screened wallet, which the review screen already includes.
  If a wallet is flagged, that route's principal is refunded to the sender and the fee is kept.

## Scripts

| | |
| - | - |
| `npm run dev` | dev server |
| `npm run build` | production build |
| `npm run lint` | typecheck |
| `npm test` | unit tests (amount maths, CSV parsing) |

## Limits

- Up to 25 routes (500 recipients) per batch. MultiHopper allows 10 transfer creates per minute per key.
- Multi-recipient SPL routes need SPL payout support on the cluster. Otherwise MultiHopper returns
  `MH_017`, and the batch can be re-run with one route per recipient.
- Routing reduces simple linkage between payer and payee. It does not erase on-chain history or
  guarantee anonymity.
