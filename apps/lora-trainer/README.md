# lora-trainer

Next.js Pages Router app for selecting [Are.na](https://are.na) images and training LoRA models via [FAL.ai](https://fal.ai). Part of the `dmbk-world` monorepo.

## Getting Started

### Prerequisites

- Node.js >= 18
- pnpm 8+

### Environment Variables

Create `.env` (or `.env.local`) in this directory:

```env
# Auth (Better Auth + SIWE)
BETTER_AUTH_SECRET=<generate with: openssl rand -base64 32>
BETTER_AUTH_URL=http://localhost:3000
ALLOWED_ADDRESSES=0xYOUR_WALLET_ADDRESS  # optional, comma-separated

# Database (Turso / libSQL)
TURSO_DATABASE_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=your-turso-auth-token

# FAL.ai (server-side only)
FAL_AI_API_KEY=your_fal_ai_api_key

# Payment (ETH on BASE)
TRAINING_PRICE_USD=4                          # USD per training run (default: 4)
ADMIN_WALLET=0xYOUR_ADMIN_WALLET              # exempt from payment gate
PAYMENT_WALLET_PRIVATE_KEY=your_private_key   # for signing refund txs
NEXT_PUBLIC_CHAIN_ID=8453                     # BASE Mainnet (default: 8453)
```

### Database Setup

Auth data is stored in a [Turso](https://turso.tech) (hosted libSQL) database. Run the Better Auth migration to create the required tables:

```bash
npx @better-auth/cli migrate
```

This only needs to be re-run when the database schema changes (e.g. adding a Better Auth plugin or upgrading to a version with schema changes). Updating `ALLOWED_ADDRESSES` does **not** require a migration.

### Run Dev Server

From the monorepo root:

```bash
pnpm dev:lora-trainer
```

Or from this directory:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy on Vercel

### Vercel Project Setup

1. Import the repo in [Vercel](https://vercel.com/new)
2. Set **Root Directory** to `apps/lora-trainer`
3. Framework Preset: **Next.js** (auto-detected)
4. Install Command: `pnpm install`

### Environment Variables

Set the following in your Vercel project's Environment Variables settings:

| Variable             | Description                                                           |
| -------------------- | --------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET` | Auth secret key                                                       |
| `BETTER_AUTH_URL`    | Production URL: `https://arenatrainer.dmbk.io`                        |
| `ALLOWED_ADDRESSES`  | Comma-separated wallet addresses allowed to sign in                   |
| `TURSO_DATABASE_URL` | Turso database URL (auto-populated if using Vercel Turso integration) |
| `TURSO_AUTH_TOKEN`   | Turso auth token (auto-populated if using Vercel Turso integration)   |
| `FAL_AI_API_KEY`     | [FAL.ai](https://fal.ai/dashboard) API key                            |
| `TRAINING_PRICE_USD` | USD price per training run (default: `4`)                              |
| `ADMIN_WALLET`       | Admin wallet address (exempt from payment)                             |
| `PAYMENT_WALLET_PRIVATE_KEY` | Private key for the payment/refund wallet                      |
| `NEXT_PUBLIC_CHAIN_ID` | Chain ID for payment network (default: `8453` / BASE Mainnet)        |

If you created your Turso database through the Vercel Storage integration, `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` are linked automatically.
