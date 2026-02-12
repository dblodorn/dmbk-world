// Payment recipient wallet on BASE Mainnet
export const PAYMENT_RECIPIENT =
  "0xAc820091d611C2400d710E72F4b0c94051b24459" as const;

// Admin wallet that bypasses the payment gate (from public env var, no API dependency)
export const ADMIN_WALLET = process.env.NEXT_PUBLIC_ADMIN_WALLET ?? null;

// QA wallets that bypass the payment gate (for testing)
export const QA_WALLETS = [
  "0xC2ea7d6B9766e592Eceb5e02BAA35A1272441f80",
] as const;

// Default chain ID — configurable via NEXT_PUBLIC_CHAIN_ID env var (defaults to BASE Mainnet: 8453)
export const BASE_CHAIN_ID = Number(
  process.env.NEXT_PUBLIC_CHAIN_ID ?? "8453",
);
