---
title: "fix: Add Resource Limits to Image Download Pipeline"
type: fix
date: 2026-02-12
security_audit_ref: "Finding #3 (CRITICAL) — No Resource Limits on Image Downloads"
brainstorm: docs/brainstorms/2026-02-12-image-download-resource-limits-brainstorm.md
---

# fix: Add Resource Limits to Image Download Pipeline

## Overview

The image download and zip creation pipeline in `packages/api/src/features/fal.ts` has no resource limits. `createImageZip()` downloads up to 20 images in unbounded parallel with no size caps, buffers everything in memory via JSZip, and base64-encodes the result. Peak memory for a single request can exceed **10 GB** — a critical memory exhaustion DoS vector.

This fix adds streaming size enforcement, per-image timeouts, concurrency limiting, and replaces JSZip with the streaming `archiver` library. Worst-case peak memory drops from 10+ GB to ~250 MB — a **40x reduction**.

## Problem Statement / Motivation

A single malicious or unlucky request can crash the server:

1. **No per-image size limit** — `response.arrayBuffer()` buffers arbitrarily large responses
2. **Unbounded parallel downloads** — all 20 images via `Promise.all()` means 20 buffers in memory simultaneously
3. **Triple memory copies** — downloaded buffers + JSZip internal copies + generated zip buffer
4. **Zip verification doubles peak** — re-loading zip into a second JSZip instance
5. **Base64 encoding** — creates another ~133% copy of the zip

## Proposed Solution

### 1. Streaming download with size enforcement (`downloadImage()`)

Replace `response.arrayBuffer()` with streaming reads via `response.body.getReader()`. Count bytes as they arrive; abort if cumulative size exceeds **5 MB**.

```typescript
// packages/api/src/features/fal.ts — downloadImage()
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB
const DOWNLOAD_TIMEOUT_MS = 30_000; // 30 seconds

async function downloadImage(url: string): Promise<{ filename: string; data: Buffer } | null> {
  validateImageUrl(url);

  const response = await fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });

  // Content-Type check (existing)
  // ...

  // Early reject via Content-Length (optimization — headers can lie)
  const contentLength = Number(response.headers.get("content-length"));
  if (contentLength > MAX_IMAGE_SIZE) {
    throw new Error(`Image exceeds ${MAX_IMAGE_SIZE} byte limit (Content-Length: ${contentLength})`);
  }

  // Streaming size enforcement (authoritative)
  const reader = response.body!.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_IMAGE_SIZE) {
      reader.cancel();
      throw new Error(`Image exceeds ${MAX_IMAGE_SIZE} byte limit (streamed ${totalBytes} bytes)`);
    }
    chunks.push(value);
  }

  const buffer = Buffer.concat(chunks);
  // ... minimum size check, filename extraction (existing)
  return { filename, data: buffer };
}
```

Key details:
- `AbortSignal.timeout(30_000)` covers the entire fetch + stream read operation
- Content-Length is checked as an optimization but **not trusted** — streaming enforcement is authoritative
- Images exactly 5 MB are allowed (strictly greater than)
- The function still returns a `Buffer` — each image is fully buffered before being passed to archiver (safe for partial-failure semantics)

### 2. Replace JSZip with `archiver` (`createImageZip()`)

Replace the in-memory JSZip with `archiver` configured for `store` compression (images are already compressed — deflate adds CPU time with negligible size reduction).

```typescript
// packages/api/src/features/fal.ts — createImageZip()
import archiver from "archiver";
import { PassThrough } from "node:stream";

async function createImageZip(imageUrls: string[]): Promise<Buffer> {
  // Download with concurrency limit of 5
  const results = await downloadWithConcurrency(imageUrls, 5);
  const validImages = results.filter((r): r is NonNullable<typeof r> => r !== null);

  if (validImages.length === 0) {
    throw new Error("Failed to download any images");
  }

  // Create archive — use 'store' since images are already compressed
  const archive = archiver("zip", { store: true });
  const chunks: Buffer[] = [];

  const output = new PassThrough();
  output.on("data", (chunk: Buffer) => chunks.push(chunk));

  archive.pipe(output);

  for (const [index, image] of validImages.entries()) {
    const uniqueName = `${index + 1}_${image.filename}`;
    archive.append(image.data, { name: uniqueName });
  }

  await archive.finalize();
  return Buffer.concat(chunks);
}
```

Key details:
- `store` compression (no deflate) — faster, no meaningful size reduction on compressed images
- Images are appended as `Buffer` (not streams) — this means each image is fully buffered, but it preserves the existing partial-failure contract cleanly
- The `archive.finalize()` promise resolves when all data has been written to the output
- Remove the zip verification step entirely — `archiver` is reliable and the verification doubled memory

### 3. Concurrency-limited downloads

Implement a simple concurrency limiter inline (no external dependency needed):

```typescript
// packages/api/src/features/fal.ts
async function downloadWithConcurrency(
  urls: string[],
  concurrency: number,
): Promise<(DownloadResult | null)[]> {
  const results: (DownloadResult | null)[] = new Array(urls.length).fill(null);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < urls.length) {
      const index = nextIndex++;
      try {
        results[index] = await downloadImage(urls[index]);
      } catch (error) {
        console.error(`Failed to download image ${index + 1}/${urls.length}: ${error}`);
        results[index] = null;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, () => worker()));
  return results;
}
```

Key details:
- Worker pool pattern — spawns `min(5, urls.length)` workers that pull from a shared index
- Preserves insertion order in results array (important for consistent zip filename numbering)
- Failed downloads return `null` (existing behavior)

### 4. Update mutations

**`downloadImageZip`** — collect archiver output into buffer for base64 (no change to transport):

```typescript
const zipBuffer = await createImageZip(input.imageUrls);
const base64Zip = zipBuffer.toString("base64");

return {
  filename: `lora-training-${sanitized}-${timestamp}`,
  data: base64Zip,
  size: zipBuffer.length,
  imageCount: validImages.length, // actual count, not requested
};
```

- Change `imageCount` from `input.imageUrls.length` to actual successful count
- Remove `success: true` field (redundant with tRPC error semantics; frontend doesn't use it)

**`trainLora`** — same `createImageZip()` changes apply automatically. Convert zip buffer to Blob for FAL upload as before.

### 5. Dependency changes (`packages/api/package.json`)

- **Add:** `archiver`, `@types/archiver`
- **Remove:** `jszip`, `@types/jszip`

## Technical Considerations

### Response shape changes

The `downloadImageZip` mutation response changes slightly:

| Field | Before | After |
|---|---|---|
| `success` | `true` (always) | **Removed** |
| `imageCount` | Requested count | **Actual** successful count |

The frontend (`ArenaChannelFetcher.tsx:178-183`) only uses `data.data` and `data.filename` — neither removed/changed field is consumed. TypeScript types will update automatically via tRPC inference.

### Error messaging

When downloads fail due to the new limits, provide actionable error messages:

- Size exceeded: `"Image exceeds 5 MB limit (Content-Length: 8388608)"`
- Timeout: `"Image download timed out after 30 seconds"` (via AbortSignal)
- All failed: Include summary — `"All 20 images failed: 15 exceeded 5 MB limit, 5 timed out"`

### Archiver mid-stream failure

Downloads are fully buffered in `downloadImage()` before being passed to archiver. This means archiver only receives complete, valid image buffers — no risk of partially-written zip entries from mid-stream download failures.

### Memory budget (worst case)

| Phase | Peak | Notes |
|---|---|---|
| Download | 5 concurrent x 5 MB = 25 MB | Streaming enforcement per-image |
| Archiver output | ~100 MB | 20 images x 5 MB, store compression |
| Base64 conversion | ~133 MB | 100 MB x 1.33 |
| JSON serialization | ~133 MB | tRPC response |
| **Total worst case** | **~250 MB** | Down from 10+ GB |

### Request cancellation

tRPC procedures receive an `AbortSignal` via `opts.signal`. Wire this into the download pipeline so abandoned requests stop consuming resources. This is a nice-to-have — if not implemented now, the 30-second per-image timeout bounds the worst case.

## Testing

New test file: `packages/api/src/features/__tests__/image-download-limits.test.ts`

Uses Vitest (already configured) with `vi.stubGlobal('fetch', ...)` to mock HTTP responses. Sits alongside the existing `ssrf.test.ts`.

### downloadImage() — Size Enforcement

```typescript
describe("downloadImage size limits", () => {
  // Helper: create a mock fetch Response with a readable stream of N bytes
  function mockFetchWithSize(bytes: number, contentLength?: number): typeof fetch;

  it("accepts an image under 5 MB");
  it("accepts an image at exactly 5 MB");
  it("rejects an image over 5 MB via streaming enforcement");
  it("rejects early when Content-Length header exceeds 5 MB");
  it("still enforces via streaming when Content-Length lies (claims small, sends large)");
  it("does not false-reject when Content-Length is missing");
});
```

### downloadImage() — Timeout

```typescript
describe("downloadImage timeout", () => {
  // Use a shorter timeout in tests (override DOWNLOAD_TIMEOUT_MS or inject it)
  it("aborts when server never responds (fetch hangs)");
  it("aborts when server sends data slower than the timeout allows");
  it("succeeds when server responds just before the timeout");
});
```

### downloadWithConcurrency()

```typescript
describe("downloadWithConcurrency", () => {
  it("limits concurrent downloads to the specified concurrency");
  // Track active count: increment before await, decrement after, assert max <= concurrency
  it("preserves insertion order in results regardless of completion order");
  it("returns null for failed downloads without affecting others");
  it("handles fewer URLs than the concurrency limit");
  it("handles a single URL");
});
```

### createImageZip() — Archiver Integration

```typescript
describe("createImageZip", () => {
  // Mock downloadImage (or fetch) to return known buffers
  it("produces a valid zip containing all successful images");
  // Unzip the result with archiver/adm-zip and verify contents
  it("produces a valid partial zip when some downloads fail");
  it("throws when all downloads fail");
  it("uses sequential filenames (1_name.jpg, 2_name.jpg, ...)");
  it("produces a valid zip with a single image");
});
```

### Integration: downloadImageZip Mutation Response Shape

```typescript
describe("downloadImageZip response", () => {
  // Call through the tRPC router directly (not HTTP) using createCallerFactory
  it("returns base64-encoded zip data that decodes to a valid zip");
  it("returns imageCount matching actual successful downloads, not requested count");
  it("does not include a 'success' field in the response");
  it("returns correct filename format");
});
```

### Test Utilities

- `mockFetchWithSize(bytes, opts?)` — Returns a mock `fetch` that produces a `Response` with a `ReadableStream` body of the specified byte count. Supports optional `contentLength` header override and `delay` per chunk for timeout testing.
- `mockFetchWithError(error)` — Returns a mock `fetch` that rejects with the given error.
- Use `vi.useFakeTimers()` for timeout tests to avoid actually waiting 30 seconds.

### Running Tests

```bash
pnpm --filter @dmbk-world/api test
```

## Acceptance Criteria

- [x] `downloadImage()` enforces 5 MB per-image limit via streaming byte counting
- [x] `downloadImage()` enforces 30-second timeout via `AbortSignal.timeout()`
- [x] Content-Length header checked as early rejection optimization
- [x] `createImageZip()` uses `archiver` with `store` compression instead of JSZip
- [x] Download concurrency limited to 5 at a time
- [x] Zip verification step removed
- [x] Failed downloads are skipped; partial zips returned with successful images
- [x] If all downloads fail, error is thrown with failure reason summary
- [x] `imageCount` in `downloadImageZip` response reflects actual successful count
- [x] `jszip` and `@types/jszip` removed from dependencies
- [x] `archiver` and `@types/archiver` added to dependencies
- [x] Existing SSRF protections (`validateImageUrl`, redirect blocking, domain allowlist) unchanged
- [x] Frontend `downloadImageZip` and `trainLora` flows work end-to-end
- [x] Unit tests for size enforcement (under, at, over 5 MB; Content-Length early reject; lying headers)
- [x] Unit tests for timeout (hanging server, slow server)
- [x] Unit tests for concurrency limiting (max active count, insertion order, partial failures)
- [x] Unit tests for archiver zip output (valid zip, partial zip, all-fail, filename format)
- [ ] Integration test for `downloadImageZip` response shape (base64, imageCount, no success field)

## Success Metrics

- Peak memory per request reduced from 10+ GB to ~250 MB worst case
- No regression in happy-path behavior (all images < 5 MB download and zip correctly)
- Oversized images are rejected without buffering entire response
- Slow servers time out after 30 seconds instead of hanging indefinitely

## Dependencies & Risks

**Dependencies:**
- `archiver` npm package (battle-tested, 20M+ weekly downloads)
- Node.js >= 18 (confirmed: `engines: >=18`, running v25 locally)

**Risks:**
- **Low:** are.na images exceeding 5 MB — most web-optimized images are well under this. If users report legitimate images being rejected, the limit can be raised.
- **Low:** `archiver` API differences from JSZip — archiver is well-documented and the usage is straightforward (append buffers, finalize).
- **Medium:** The ~250 MB worst case is still substantial. The brainstorm explicitly defers binary streaming transport (eliminating base64) to a separate effort.

## Affected Files

| File | Change |
|---|---|
| `packages/api/src/features/fal.ts` | Core changes: streaming download, archiver, concurrency limiter |
| `packages/api/package.json` | Add archiver, remove jszip |
| `packages/api/src/features/__tests__/image-download-limits.test.ts` | New test file for resource limits |

## References & Research

- Brainstorm: `docs/brainstorms/2026-02-12-image-download-resource-limits-brainstorm.md`
- Security audit: Finding #3 (CRITICAL)
- Current implementation: `packages/api/src/features/fal.ts:110-284`
- Frontend consumer: `apps/lora-trainer/src/components/ArenaChannelFetcher.tsx:151-183`
- SSRF tests: `packages/api/src/features/__tests__/ssrf.test.ts`
- Existing SSRF protections: `packages/api/src/features/fal.ts:17-107`
