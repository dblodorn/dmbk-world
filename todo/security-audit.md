# Security Audit: lora-trainer App & API Package

## Context

This is a security audit of the `apps/lora-trainer` Next.js app and `packages/api` tRPC backend. The app lets users select images from are.na channels, download them as zips, and submit LoRA training jobs to FAL.ai. All API routes are unauthenticated (`publicProcedure`), and the server fetches arbitrary user-provided URLs, making this the primary attack surface.

---

## Findings by Severity

### CRITICAL

#### 2. SSRF — Server Fetches Arbitrary User-Provided URLs

- **File:** `packages/api/src/features/fal.ts:14-73` (`downloadImage()`)
- `imageUrls` input is `z.array(z.string().url())` — any valid URL is accepted
- The server calls `fetch(url)` with no restrictions on destination
- Attack vectors:
  - `http://169.254.169.254/latest/meta-data/` — steal cloud metadata/credentials
  - `http://localhost:3000/api/trpc/...` — hit internal services
  - `http://internal-service:8080/admin` — reach internal network
- The Content-Type check (`image/*`) happens **after** the request is made, so the data has already been fetched
- The fake browser User-Agent (line 22-24) makes this worse — it helps bypass bot protections on internal services

**Recommendation:**

- Validate URLs against an allowlist of domains (e.g., only `*.are.na`, `d2w9rnfcy7mm78.cloudfront.net`)
- Resolve hostnames and reject private/internal IP ranges (127.0.0.0/8, 10.0.0.0/8, 169.254.0.0/16, 172.16.0.0/12, 192.168.0.0/16)
- Remove the fake browser User-Agent

#### 3. No Resource Limits on Image Downloads — Memory Exhaustion DoS

- **File:** `packages/api/src/features/fal.ts:76-134` (`createImageZip()`)
- 20 images downloaded in parallel with `Promise.all()`, no per-image size cap
- An attacker provides 20 URLs to multi-GB images → server runs out of memory
- Zip compression at level 6 (line 118) amplifies CPU usage
- The zip is then converted to base64 (line 156), roughly 1.33x the buffer size, doubling memory usage

**Recommendation:**

- Add a per-image size limit (e.g., 10MB) by checking `Content-Length` header before downloading, and aborting mid-stream if exceeded
- Add a total zip size limit
- Stream images instead of buffering entirely in memory

### HIGH

#### 4. No Rate Limiting

- **Files:** All tRPC procedures
- No rate limiting on any endpoint
- Allows unlimited are.na API abuse (could get your IP banned), unlimited FAL.ai job submission, and general DoS

**Recommendation:** Add tRPC middleware rate limiting using `@upstash/ratelimit` or a simple in-memory token bucket.

#### 5. Vulnerable Transitive Dependencies via `are.na@0.1.5`

- **File:** `packages/api/package.json` (line 20)
- `are.na@0.1.5` depends on `axios@0.18.1` (from 2018) and `follow-redirects` with multiple CVEs
- Known vulnerabilities: SSRF in axios, DoS via `__proto__` key, multiple follow-redirects issues
- `pnpm audit` reports 13 vulnerabilities (6 high, 6 moderate, 1 low)

**Recommendation:** Fork `are.na` to update axios, or replace it with direct `fetch()` calls to the are.na API (it's a simple REST API).

#### 6. No Security Headers

- **File:** `apps/lora-trainer/next.config.ts`
- Missing: Content-Security-Policy, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy
- App is vulnerable to clickjacking (iframe embedding) and MIME-sniffing attacks

**Recommendation:** Add a `headers()` function to `next.config.ts` with standard security headers.

### MEDIUM

#### 7. Verbose Logging Leaks Sensitive Information

- **File:** `packages/api/src/features/fal.ts` — 15+ `console.log` calls
- Logs include: full URLs being fetched (line 18, 28), response headers (line 36), FAL storage URLs (line 206), request IDs (line 220)
- In production, these end up in hosting platform logs (Vercel, etc.)

**Recommendation:** Remove or gate behind `NODE_ENV === "development"`. Use a proper logger with levels.

#### 8. Error Messages Leak Internal Details

- **Files:** `packages/api/src/features/fal.ts:171-175, 228-232`, `packages/api/src/env.ts:30-32`
- Errors include internal error messages, env variable names, and FAL.ai integration details
- Helps attackers understand system architecture

**Recommendation:** Return generic error messages to clients; log details server-side only.

#### 9. Unsanitized `triggerWord` in Filename

- **File:** `packages/api/src/features/fal.ts:160`
- `triggerWord` is interpolated directly into the filename: `` `lora-training-${input.triggerWord}-${timestamp}.zip` ``
- Only validated as 1-50 chars, allowing special characters like `../`, quotes, etc.
- Currently returned to client (not written to disk), so risk is low but could become an issue

**Recommendation:** Sanitize to alphanumeric + hyphens: `triggerWord.replace(/[^a-zA-Z0-9-_]/g, '')`

### LOW

#### 10. Overly Permissive Arena URL Regex

- **File:** `packages/api/src/features/arena.ts:8`
- Regex `[^\/]+` allows URL-encoded special characters in the slug
- Low risk since the slug is passed to the `are.na` SDK which handles it

#### 11. `.env.local` in `.gitignore` (Positive)

- `.gitignore` properly excludes `.env`, `.env.local`, and `.env*.local`
- No secrets found in source code

---

## Positive Findings

- All inputs validated with Zod schemas
- No `dangerouslySetInnerHTML`, `eval()`, or dynamic code execution
- No SQL (no database)
- No client-side secret exposure (FAL_AI_API_KEY is server-only)
- TypeScript + tRPC provides end-to-end type safety
- `.env.local` properly gitignored
- Lazy API key validation (only when fal routes are called)

---

## Recommended Fixes (Priority Order)

### Immediate (address before any production deployment)

1. **Add authentication** to tRPC procedures (bearer token or session)
2. **Add SSRF protection** to `downloadImage()` — domain allowlist + private IP rejection
3. **Add image size limits** — check Content-Length, abort on oversized downloads
4. **Add rate limiting** middleware

### Soon

5. **Add security headers** in `next.config.ts`
6. **Replace or fork `are.na@0.1.5`** to eliminate vulnerable transitive deps
7. **Clean up logging** — remove or gate verbose console.log statements

### When convenient

8. **Sanitize `triggerWord`** for filename use
9. **Genericize client-facing error messages**

---

## Files to Modify

| Fix                   | File(s)                                                                      |
| --------------------- | ---------------------------------------------------------------------------- |
| Auth middleware       | `packages/api/src/trpc.ts`, `apps/lora-trainer/src/pages/api/trpc/[trpc].ts` |
| SSRF protection       | `packages/api/src/features/fal.ts` (`downloadImage`)                         |
| Image size limits     | `packages/api/src/features/fal.ts` (`downloadImage`)                         |
| Rate limiting         | `packages/api/src/trpc.ts` (new middleware)                                  |
| Security headers      | `apps/lora-trainer/next.config.ts`                                           |
| Dependency update     | `packages/api/package.json`                                                  |
| Logging cleanup       | `packages/api/src/features/fal.ts`                                           |
| Filename sanitization | `packages/api/src/features/fal.ts:160`                                       |
| Error messages        | `packages/api/src/features/fal.ts`, `packages/api/src/features/arena.ts`     |

## Verification

- After applying fixes, run `pnpm build` to ensure no type errors
- Test the are.na fetch flow end-to-end with `pnpm dev:lora-trainer`
- Verify SSRF protection by attempting to fetch `http://localhost:3000` as an image URL (should be rejected)
- Verify rate limiting by sending rapid requests
- Check response headers with `curl -I http://localhost:3000` for security headers
- Run `pnpm audit` to verify dependency vulnerabilities are resolved

### COMPLETED:

#### 1. No Authentication — Anyone Can Burn Your FAL.ai Credits

- **Files:** `packages/api/src/trpc.ts`, `apps/lora-trainer/src/pages/api/trpc/[trpc].ts`
- All 6 tRPC procedures use `publicProcedure` with no auth middleware
- `createContext` is empty `() => ({})`
- An attacker can call `fal.trainLora` repeatedly to consume your FAL.ai API credits (real money)
- They can also call `fal.cancelTraining` to cancel your legitimate jobs

**Recommendation:** Add an auth middleware. For a personal/internal tool, a simple shared secret via `Authorization` header or session-based auth is sufficient. At minimum, add IP allowlisting or a bearer token check.
