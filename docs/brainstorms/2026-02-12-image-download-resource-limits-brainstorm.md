# Image Download Resource Limits — Memory Exhaustion DoS Fix

**Date:** 2026-02-12
**Status:** Brainstorm complete
**Security audit ref:** Finding #3 (CRITICAL) — No Resource Limits on Image Downloads

## What We're Building

Resource limits and streaming for the image download/zip pipeline in `packages/api/src/features/fal.ts` to prevent memory exhaustion DoS attacks. Currently, `createImageZip()` downloads up to 20 images in parallel with no size caps, buffers everything in memory, compresses with JSZip, and (for `downloadImageZip`) base64-encodes the result. Peak memory for a single request could exceed 10 GB.

### Goals

- Per-image size limit: **5 MB** with early abort (streaming size enforcement)
- Per-image download timeout: **30 seconds** via `AbortSignal.timeout()`
- Replace in-memory JSZip with **streaming `archiver`** library
- Limit download concurrency (3-5 at a time instead of all 20 via `Promise.all()`)
- Remove the zip verification step (re-loading entire zip into a second JSZip instance)
- Keep base64 transport for `downloadImageZip` mutation for now

### Non-Goals

- Changing the transport mechanism (base64 JSON → binary stream) — separate effort
- Adding rate limiting (separate audit finding #4)
- Authentication changes (separate audit finding #1)

## Why This Approach

### Streaming downloads with size enforcement

Instead of calling `response.arrayBuffer()` which buffers the entire response, we read the response body as a stream, count bytes as they arrive, and abort if the 5 MB limit is exceeded. This means we never allocate more than ~5 MB for a single image regardless of what the server sends.

### `archiver` instead of JSZip

JSZip is a purely in-memory library — it holds all file contents in memory until `generateAsync()` is called. `archiver` is a streaming zip library that can accept input streams and produce output as a stream. This means we can pipe each image directly into the archive without holding all 20 images in memory simultaneously.

### Limited concurrency

Downloading 20 images in parallel via `Promise.all()` means all 20 buffers exist in memory at once. By limiting concurrency to 3-5, we cap peak memory from downloads to 15-25 MB instead of 100 MB.

### 30-second timeout

Prevents slow-loris style attacks where a malicious server sends data extremely slowly to hold server resources.

## Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Per-image size limit | 5 MB | Conservative but handles most web images. 20 images × 5 MB = 100 MB max. |
| Zip library | `archiver` | Battle-tested streaming zip. Simple API, handles backpressure. |
| Download concurrency | 3-5 | Caps peak download memory while still being reasonably fast. |
| Per-image timeout | 30 seconds | Generous enough for large images over slow CDN, short enough to prevent abuse. |
| Base64 transport | Keep for now | With 100 MB max zip, base64 overhead (~33%) is bounded. Address later. |
| Zip verification step | Remove | Unnecessary overhead that doubles zip memory. `archiver` is reliable. |

## Peak Memory Analysis (After Fix)

With 5 MB per-image limit and 3 concurrent downloads:

1. **Download phase:** 3 × 5 MB = ~15 MB peak (streams, not all buffered)
2. **Archiver output buffer:** ~100 MB max (20 images × 5 MB, minimal compression on already-compressed images)
3. **Base64 conversion:** ~133 MB (100 MB × 1.33)
4. **JSON serialization:** ~133 MB

**Worst case: ~250 MB** (down from 10+ GB) — a **40x reduction**.

## Affected Code

| Component | File | Change |
|---|---|---|
| `downloadImage()` | `packages/api/src/features/fal.ts` | Streaming download with size limit + timeout |
| `createImageZip()` | `packages/api/src/features/fal.ts` | Replace JSZip with archiver, limit concurrency |
| `downloadImageZip` mutation | `packages/api/src/features/fal.ts` | Collect archiver output to buffer for base64 |
| `trainLora` mutation | `packages/api/src/features/fal.ts` | Same createImageZip changes apply |
| Dependencies | `packages/api/package.json` | Add `archiver` + `@types/archiver`, remove `jszip` |

## Open Questions

- **Exact concurrency number:** 3 or 5? Leaning toward 3 for safety.
- **Should `Content-Length` be checked before streaming?** As an optimization — if the header says > 5 MB, reject immediately without reading the body. But still enforce via streaming since headers can lie.
- **Error handling for partial zips:** If image 15/20 fails mid-stream, should the zip contain the first 14 images or fail entirely? Current behavior: failed images are skipped (returns partial zip).
