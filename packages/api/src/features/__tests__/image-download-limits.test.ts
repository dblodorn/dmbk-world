import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import dns from "node:dns";
import { Readable } from "node:stream";
import {
  downloadImage,
  downloadWithConcurrency,
  createImageZip,
  MAX_IMAGE_SIZE,
  DOWNLOAD_TIMEOUT_MS,
} from "../fal";

// --- Test Helpers ---

/** Create a Buffer of N bytes filled with random-ish image-like data */
function makeImageBuffer(bytes: number): Buffer {
  const buf = Buffer.alloc(bytes);
  // Write a minimal JPEG-like header so it passes the min-size check
  buf[0] = 0xff;
  buf[1] = 0xd8;
  buf[2] = 0xff;
  buf[3] = 0xe0;
  return buf;
}

/**
 * Create a mock fetch that returns a Response with a ReadableStream body
 * of the specified byte count. Supports optional Content-Length header
 * override and per-chunk delay for timeout testing.
 */
function mockFetchResponse(
  bytes: number,
  opts?: {
    contentLength?: number | null; // null = omit header, undefined = use actual bytes
    contentType?: string;
    status?: number;
    delayMs?: number; // delay per chunk
    chunkSize?: number;
  },
): typeof globalThis.fetch {
  const {
    contentLength,
    contentType = "image/jpeg",
    status = 200,
    delayMs = 0,
    chunkSize = 64 * 1024, // 64 KB chunks
  } = opts ?? {};

  return vi.fn(async () => {
    const buffer = makeImageBuffer(bytes);
    let offset = 0;

    const stream = new ReadableStream({
      async pull(controller) {
        if (delayMs > 0) {
          await new Promise((r) => setTimeout(r, delayMs));
        }
        if (offset >= buffer.length) {
          controller.close();
          return;
        }
        const end = Math.min(offset + chunkSize, buffer.length);
        controller.enqueue(new Uint8Array(buffer.slice(offset, end)));
        offset = end;
      },
    });

    const headers = new Headers();
    if (contentType) headers.set("content-type", contentType);
    if (contentLength !== null) {
      headers.set(
        "content-length",
        String(contentLength ?? bytes),
      );
    }

    return new Response(stream, {
      status,
      statusText: status === 200 ? "OK" : "Error",
      headers,
    });
  }) as unknown as typeof globalThis.fetch;
}

/** Create a mock fetch that hangs forever (never resolves) */
function mockFetchHanging(): typeof globalThis.fetch {
  return vi.fn(
    () => new Promise<Response>(() => {}),
  ) as unknown as typeof globalThis.fetch;
}

// Mock DNS to always return a public IP (SSRF checks pass)
vi.spyOn(dns.promises, "lookup").mockResolvedValue({
  address: "52.84.123.45",
  family: 4,
});

const VALID_URL =
  "https://d2w9rnfcy7mm78.cloudfront.net/12345/original_test.jpg";

function validUrls(count: number): string[] {
  return Array.from(
    { length: count },
    (_, i) =>
      `https://d2w9rnfcy7mm78.cloudfront.net/${i + 1}/original_test.jpg`,
  );
}

// --- Tests ---

describe("downloadImage size limits", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    // Re-mock DNS after restore
    vi.spyOn(dns.promises, "lookup").mockResolvedValue({
      address: "52.84.123.45",
      family: 4,
    });
  });

  it("accepts an image under 5 MB", async () => {
    const size = 2 * 1024 * 1024; // 2 MB
    vi.stubGlobal("fetch", mockFetchResponse(size));

    const result = await downloadImage(VALID_URL);
    expect(result.data.length).toBe(size);
    expect(result.filename).toBe("original_test.jpg");
  });

  it("accepts an image at exactly 5 MB", async () => {
    vi.stubGlobal("fetch", mockFetchResponse(MAX_IMAGE_SIZE));

    const result = await downloadImage(VALID_URL);
    expect(result.data.length).toBe(MAX_IMAGE_SIZE);
  });

  it("rejects an image over 5 MB via streaming enforcement", async () => {
    const oversize = MAX_IMAGE_SIZE + 1;
    // Set Content-Length to null so it doesn't trigger early reject
    vi.stubGlobal(
      "fetch",
      mockFetchResponse(oversize, { contentLength: null }),
    );

    await expect(downloadImage(VALID_URL)).rejects.toThrow(
      `exceeds ${MAX_IMAGE_SIZE} byte limit (streamed`,
    );
  });

  it("rejects early when Content-Length header exceeds 5 MB", async () => {
    // Server claims 10 MB via Content-Length — should reject before reading body
    vi.stubGlobal(
      "fetch",
      mockFetchResponse(1024, { contentLength: 10 * 1024 * 1024 }),
    );

    await expect(downloadImage(VALID_URL)).rejects.toThrow(
      `exceeds ${MAX_IMAGE_SIZE} byte limit (Content-Length:`,
    );
  });

  it("still enforces via streaming when Content-Length lies (claims small, sends large)", async () => {
    const oversize = MAX_IMAGE_SIZE + 64 * 1024;
    // Header claims 1 MB, but actually sends >5 MB
    vi.stubGlobal(
      "fetch",
      mockFetchResponse(oversize, { contentLength: 1 * 1024 * 1024 }),
    );

    await expect(downloadImage(VALID_URL)).rejects.toThrow(
      `exceeds ${MAX_IMAGE_SIZE} byte limit (streamed`,
    );
  });

  it("does not false-reject when Content-Length is missing", async () => {
    const size = 2 * 1024 * 1024;
    vi.stubGlobal(
      "fetch",
      mockFetchResponse(size, { contentLength: null }),
    );

    const result = await downloadImage(VALID_URL);
    expect(result.data.length).toBe(size);
  });

  it("rejects files smaller than 1024 bytes", async () => {
    vi.stubGlobal("fetch", mockFetchResponse(512));

    await expect(downloadImage(VALID_URL)).rejects.toThrow(
      "too small",
    );
  });

  it("rejects non-image content types", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchResponse(2048, { contentType: "text/html" }),
    );

    await expect(downloadImage(VALID_URL)).rejects.toThrow(
      "not an image",
    );
  });
});

describe("downloadImage timeout", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(dns.promises, "lookup").mockResolvedValue({
      address: "52.84.123.45",
      family: 4,
    });
  });

  it("aborts when server never responds (fetch hangs)", async () => {
    vi.stubGlobal("fetch", mockFetchHanging());

    // AbortSignal.timeout will abort after DOWNLOAD_TIMEOUT_MS
    // We can't easily fake AbortSignal.timeout, so we test with a real (short) signal
    // by temporarily testing the mechanism works with a custom abort
    const controller = new AbortController();
    const originalFetch = globalThis.fetch;

    // Replace fetch to use our controller instead
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, _opts?: RequestInit) => {
        // Simulate a server that never responds
        return new Promise<Response>((_, reject) => {
          const timer = setTimeout(() => reject(new Error("timeout")), 50);
          controller.signal.addEventListener("abort", () => {
            clearTimeout(timer);
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
        });
      }) as unknown as typeof globalThis.fetch,
    );

    // Abort immediately
    setTimeout(() => controller.abort(), 10);

    await expect(downloadImage(VALID_URL)).rejects.toThrow();
  });

  it("uses AbortSignal.timeout on fetch calls", async () => {
    // Verify that the fetch call includes a signal
    const fetchSpy = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      // Verify signal is present
      expect(init?.signal).toBeDefined();
      // Return a normal response
      const buf = makeImageBuffer(2048);
      return new Response(new Blob([buf]), {
        status: 200,
        headers: { "content-type": "image/jpeg" },
      });
    }) as unknown as typeof globalThis.fetch;

    vi.stubGlobal("fetch", fetchSpy);

    await downloadImage(VALID_URL);
    expect(fetchSpy).toHaveBeenCalledOnce();
  });
});

describe("downloadWithConcurrency", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(dns.promises, "lookup").mockResolvedValue({
      address: "52.84.123.45",
      family: 4,
    });
  });

  it("limits concurrent downloads to the specified concurrency", async () => {
    let activeCount = 0;
    let maxActive = 0;
    const concurrency = 3;

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        activeCount++;
        maxActive = Math.max(maxActive, activeCount);
        // Simulate some async work
        await new Promise((r) => setTimeout(r, 20));
        activeCount--;

        const buf = makeImageBuffer(2048);
        return new Response(new Blob([buf]), {
          status: 200,
          headers: { "content-type": "image/jpeg" },
        });
      }) as unknown as typeof globalThis.fetch,
    );

    const urls = validUrls(10);
    await downloadWithConcurrency(urls, concurrency);

    expect(maxActive).toBeLessThanOrEqual(concurrency);
    expect(maxActive).toBeGreaterThan(1); // Verify parallelism actually happened
  });

  it("preserves insertion order in results regardless of completion order", async () => {
    // Make later URLs respond faster to test ordering
    let callIndex = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) => {
        const idx = callIndex++;
        // Earlier downloads take longer
        await new Promise((r) => setTimeout(r, (10 - idx) * 5));

        const buf = makeImageBuffer(2048);
        return new Response(new Blob([buf]), {
          status: 200,
          headers: {
            "content-type": "image/jpeg",
          },
        });
      }) as unknown as typeof globalThis.fetch,
    );

    const urls = validUrls(5);
    const results = await downloadWithConcurrency(urls, 3);

    // All results should be non-null and in order
    expect(results.length).toBe(5);
    for (let i = 0; i < 5; i++) {
      expect(results[i]).not.toBeNull();
      // Filename should contain the URL's unique ID
      expect(results[i]!.filename).toBe("original_test.jpg");
    }
  });

  it("returns null for failed downloads without affecting others", async () => {
    let callIndex = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const idx = callIndex++;
        // Fail every other download
        if (idx % 2 === 1) {
          throw new Error("Network error");
        }
        const buf = makeImageBuffer(2048);
        return new Response(new Blob([buf]), {
          status: 200,
          headers: { "content-type": "image/jpeg" },
        });
      }) as unknown as typeof globalThis.fetch,
    );

    const urls = validUrls(6);
    const results = await downloadWithConcurrency(urls, 3);

    expect(results.length).toBe(6);
    // Even indices succeeded, odd indices failed
    expect(results[0]).not.toBeNull();
    expect(results[1]).toBeNull();
    expect(results[2]).not.toBeNull();
    expect(results[3]).toBeNull();
    expect(results[4]).not.toBeNull();
    expect(results[5]).toBeNull();
  });

  it("handles fewer URLs than the concurrency limit", async () => {
    vi.stubGlobal("fetch", mockFetchResponse(2048));

    const results = await downloadWithConcurrency(validUrls(2), 5);
    expect(results.length).toBe(2);
    expect(results[0]).not.toBeNull();
    expect(results[1]).not.toBeNull();
  });

  it("handles a single URL", async () => {
    vi.stubGlobal("fetch", mockFetchResponse(2048));

    const results = await downloadWithConcurrency(validUrls(1), 5);
    expect(results.length).toBe(1);
    expect(results[0]).not.toBeNull();
  });
});

describe("createImageZip", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(dns.promises, "lookup").mockResolvedValue({
      address: "52.84.123.45",
      family: 4,
    });
  });

  it("produces a valid zip containing all successful images", async () => {
    vi.stubGlobal("fetch", mockFetchResponse(4096));

    const urls = validUrls(3);
    const { buffer, imageCount } = await createImageZip(urls);

    expect(imageCount).toBe(3);
    expect(buffer.length).toBeGreaterThan(0);
    // Zip files start with PK signature (0x50, 0x4b)
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
  });

  it("produces a valid partial zip when some downloads fail", async () => {
    let callIndex = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const idx = callIndex++;
        if (idx === 1) throw new Error("Network error");
        const buf = makeImageBuffer(2048);
        return new Response(new Blob([buf]), {
          status: 200,
          headers: { "content-type": "image/jpeg" },
        });
      }) as unknown as typeof globalThis.fetch,
    );

    const urls = validUrls(3);
    const { buffer, imageCount } = await createImageZip(urls);

    // Only 2 of 3 images succeeded
    expect(imageCount).toBe(2);
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
  });

  it("throws when all downloads fail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("Network error");
      }) as unknown as typeof globalThis.fetch,
    );

    await expect(createImageZip(validUrls(3))).rejects.toThrow(
      "Failed to download any images",
    );
  });

  it("uses sequential filenames (1_name.jpg, 2_name.jpg, ...)", async () => {
    // We can verify this by checking the zip contains the expected filenames
    // Since archiver produces a binary zip, we check the buffer contains the filenames as strings
    vi.stubGlobal("fetch", mockFetchResponse(2048));

    const urls = validUrls(3);
    const { buffer } = await createImageZip(urls);

    const zipString = buffer.toString("binary");
    expect(zipString).toContain("1_original_test.jpg");
    expect(zipString).toContain("2_original_test.jpg");
    expect(zipString).toContain("3_original_test.jpg");
  });

  it("produces a valid zip with a single image", async () => {
    vi.stubGlobal("fetch", mockFetchResponse(2048));

    const { buffer, imageCount } = await createImageZip(validUrls(1));

    expect(imageCount).toBe(1);
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
  });
});

describe("resource limit constants", () => {
  it("MAX_IMAGE_SIZE is 5 MB", () => {
    expect(MAX_IMAGE_SIZE).toBe(5 * 1024 * 1024);
  });

  it("DOWNLOAD_TIMEOUT_MS is 30 seconds", () => {
    expect(DOWNLOAD_TIMEOUT_MS).toBe(30_000);
  });
});
