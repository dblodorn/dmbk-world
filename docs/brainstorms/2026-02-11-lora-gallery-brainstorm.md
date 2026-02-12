# LoRA Gallery Page

**Date:** 2026-02-11
**Status:** Ready for planning

## What We're Building

A public `/loras` page that displays all LoRA models trained through the app, attributed to the wallet address that initiated each training. The page uses a row-style layout with rich detail per entry.

### Each row displays:
- Thumbnail(s) of training images used
- Trigger word
- LoRA weights URL (with copy + download actions)
- Wallet address (creator attribution)
- Date trained
- Training steps
- Number of images used

### Key characteristics:
- **Fully public** — no auth required to view; all users' LoRAs visible
- **Row layout** — horizontal rows, not a card grid
- **Actions** — copy URL to clipboard + direct download link per row

## Why This Approach

### Auto-save on training completion
Training results are currently ephemeral — shown once and lost on refresh. By auto-saving every successful training to the database, we ensure nothing is lost and every user builds a history automatically.

- Server-side save happens when `fal.trainLora` returns a successful result
- No extra user action needed (no "Save to Gallery" button)
- Simpler than webhook-based approach, sufficient for the use case

### Extend existing Turso/Kysely database
The app already uses Turso via Kysely for better-auth sessions. Adding application tables to the same database avoids new infrastructure. A `lora_trainings` table stores all training metadata.

## Key Decisions

1. **Route:** `/loras` (new Next.js page)
2. **Visibility:** Fully public, no auth to view
3. **Persistence:** Auto-save to Turso DB on successful training completion
4. **Row data:** Rich detail (thumbnails, trigger word, LoRA URL, wallet, date, steps, image count)
5. **Actions:** Copy URL + download link per row
6. **Database:** Extend existing Turso/Kysely with a new `lora_trainings` table

## Scope

### In scope:
- New `lora_trainings` database table (Kysely migration or inline creation)
- Save training results automatically after successful FAL completion
- New tRPC `lora.list` query (public, no auth required)
- New `/loras` page with row-style layout using Reshaped components
- Copy-to-clipboard and download actions per row

### Out of scope:
- Filtering/search (can add later)
- Pagination (can add later if list grows)
- Editing or deleting LoRA entries
- User profile pages

## Open Questions

- Should wallet addresses be displayed truncated (0x1234...abcd) or full?
- How many training image thumbnails to show per row (all? first 3-4?)?
- Any sorting preference (newest first is the default assumption)?
