# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Dev Commands

```bash
# Development
pnpm dev                    # Run all packages (turbo)
pnpm dev:lora-trainer       # Run only the lora-trainer app

# Build
pnpm build                  # Build all packages (turbo)

# Lint
pnpm lint                   # Lint all packages (turbo)

# Package-specific
pnpm --filter lora-trainer build:themes   # Regenerate Reshaped theme to src/themes/
pnpm --filter @dmbk-world/api build       # Build API package (tsc)
```

No test framework is currently configured.

## Architecture

This is a **pnpm workspace monorepo** managed by Turborepo.

### `packages/api` — tRPC Backend

Shared tRPC API package consumed by the lora-trainer app.

- **`src/trpc.ts`** — tRPC init (router, publicProcedure)
- **`src/index.ts`** — Exports `appRouter` and `AppRouter` type
- **`src/features/arena.ts`** — `arena.getChannelImages` query: fetches images from are.na public channels
- **`src/features/fal.ts`** — `fal.downloadImageZip` mutation (creates zip of images), `fal.trainLora` mutation (uploads to FAL storage, triggers flux-lora-fast-training)
- **`src/env.ts`** — Loads env from `../../.env.local` via dotenv; `FAL_AI_API_KEY` validated lazily (only when fal routes are called)

### `apps/lora-trainer` — Next.js Pages Router App

React 19 + Next.js 16 app for selecting are.na images and training LoRA models via FAL.ai.

- **Pages Router** (`src/pages/`): `_app.tsx` sets up tRPC + React Query + Reshaped providers; `api/trpc/[trpc].ts` is the tRPC handler
- **tRPC client**: configured in `src/utils/trpc.ts`, connects to `/api/trpc` via httpBatchLink
- **Main flow**: `ArenaChannelFetcher` orchestrates the UI — decomposed into `ChannelUrlForm`, `ImageGrid`, `ImageCard`, `Sidebar`, `SelectedImageList`, `TrainingSettings`, `StatusAlerts`

## Key Patterns

### Reshaped UI Library
- Import components from `"reshaped"` (not `"reshaped/bundle"`)
- Uses **per-component CSS** with PostCSS (`postcss-custom-media` + `@csstools/postcss-global-data` loading `themes/dmbk/media.css`)
- Custom theme "dmbk" generated at `src/themes/dmbk/` — regenerate with `build:themes`
- Theme applied in `_document.tsx`

### tRPC + react-hook-form + Reshaped
- Use `Controller` (not `register`) because Reshaped inputs emit `onChange({value})` instead of native DOM events
- Pattern: `<Controller render={({ field }) => <TextField onChange={({ value }) => field.onChange(value)} />} />`

## Environment Setup

Create `.env.local` in the project root:
```
FAL_AI_API_KEY=your_fal_ai_api_key
```
Get a key from https://fal.ai/dashboard. The key is server-side only and validated lazily when fal routes are called.
