# LoRA Image Generation & Gallery

**Date:** 2026-02-11
**Status:** Ready for planning

## What We're Building

A feature that lets authenticated users generate images from their trained LoRA models using the `fal-ai/flux-lora` text-to-image endpoint, view results immediately, and browse all past generations in a per-LoRA gallery.

### Core User Flow

1. User navigates to a completed LoRA (from `/loras` gallery or post-training)
2. Clicks "Generate" to open a modal
3. Enters a text prompt (trigger word auto-appended invisibly)
4. Clicks generate — 4 images produced in ~5-15 seconds
5. Images display in the modal with the prompt metadata
6. Images are persisted to the database
7. User can view all past generations on `/loras/[id]` detail page

### Entry Points

- **"Generate" button on each LoRA row** in the `/loras` gallery
- **Post-training completion** — once a LoRA finishes training, offer to generate

## Why This Approach

**Approach A: New `generate` router + rate limit via DB count query**

- Clean separation follows existing feature-per-file convention (`features/generate.ts`)
- Rate limiting is a simple `COUNT(*)` on `generated_images` where `created_at > 24h ago` — no extra tables
- `fal.subscribe()` for synchronous generation (fast enough at ~5-15s, no need for queue/polling)
- New `/loras/[id]` detail page provides a natural home for both generation and gallery

## Key Decisions

### Generation Settings (hardcoded for v1)

From the fal.ai playground screenshot:

| Setting | Value |
|---------|-------|
| LoRA Scale | 1.5 |
| Image Size | Square HD (1024x1024) |
| Num Inference Steps | 28 |
| Guidance Scale (CFG) | 3.5 |
| Seed | random |
| Num Images | 4 |
| Output Format | jpeg |
| Enable Safety Checker | true |

### Prompt Handling

- User enters a prompt in a single `TextField`
- System auto-appends `in the style of {trigger_word}` before sending to fal.ai
- The raw user prompt (without the appended trigger word) is what gets stored in the DB

### Rate Limiting

- **8 generation batches per 24-hour rolling window per user** (= 32 images max)
- Admin wallet (`NEXT_PUBLIC_ADMIN_WALLET`) is exempt
- Enforced server-side in the tRPC mutation
- Show remaining generations count in the UI

### Authentication

- Generation requires authentication (uses existing `protectedProcedure`)
- No payment gate for v1 — free for authenticated users

### Data Model: `generated_images` table

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | `crypto.randomBytes(16).toString("hex")` — serves as the UID |
| `lora_training_id` | TEXT NOT NULL | FK to `lora_trainings.id` |
| `wallet_address` | TEXT NOT NULL | From session context |
| `prompt` | TEXT NOT NULL | Raw user prompt (without trigger word suffix) |
| `image_url` | TEXT NOT NULL | fal.ai generated image URL |
| `image_width` | INTEGER | From fal response |
| `image_height` | INTEGER | From fal response |
| `seed` | INTEGER | From fal response |
| `created_at` | TEXT NOT NULL | ISO timestamp |

One row per image (4 rows per generation batch). Indexed on `lora_training_id` and `wallet_address`.

### tRPC Procedures

| Procedure | Type | Description |
|-----------|------|-------------|
| `generate.images` | protectedProcedure, mutation | Validate rate limit, call fal.ai, save 4 images to DB, return results |
| `generate.listByLora` | publicProcedure, query | Fetch all generated images for a LoRA, ordered by created_at desc |
| `generate.remaining` | protectedProcedure, query | Return how many generations the user has left in the current 24h window |

### Frontend Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `/loras/[id].tsx` | Page | LoRA detail page with generation + gallery |
| `GenerateModal` | Component | Modal with prompt TextField + generate button + results grid |
| `GeneratedImageGrid` | Component | Responsive grid of generated images (reusable on detail page and in modal) |

### UI Behavior

- Modal shows a `Loader` during generation (~5-15s)
- On success, 4 images render in a 2x2 grid inside the modal
- "Generate Again" button to run another batch
- Rate limit shown as "{N} of 8 generations remaining today"
- `/loras/[id]` page shows LoRA metadata at top + full gallery of all generated images below

## Open Questions

None for v1 — requirements are well-defined.

## Future Optimizations (noted, not for v1)

- **Pagination** on the gallery (infinite scroll or load-more)
- **Better relational DB** if scale demands it (Turso/libSQL is fine for now)
- **Payment gating** per generation or subscription model
- **Configurable settings** — expose image size, steps, guidance, seed in an "Advanced" accordion
- **Image download** — batch download as zip
- **Favoriting/tagging** generated images
- **Prompt history** — autocomplete from past prompts
- **Share links** — public URLs for individual generated images
- **Batch grouping** — group the 4 images from a single generation for better UX
- **Image storage migration** — fal.ai URLs may expire; consider copying to own S3/R2
