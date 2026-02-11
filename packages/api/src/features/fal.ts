import { z } from "zod";
import { protectedProcedure, router } from "../trpc";
import { requireFalApiKey } from "../env";
import { fal } from "@fal-ai/client";
import JSZip from "jszip";
import dns from "node:dns";
import net from "node:net";

// Configure fal client lazily — credentials are validated per-request
function ensureFalConfigured() {
  const key = requireFalApiKey();
  fal.config({ credentials: key });
}

// --- SSRF Protection ---

export const ALLOWED_IMAGE_DOMAINS: readonly string[] = [
  "d2w9rnfcy7mm78.cloudfront.net", // are.na primary CDN
  ".are.na", // all are.na subdomains
] as const;

export function isPrivateIP(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split(".").map(Number);
    return (
      parts[0] === 10 || // 10.0.0.0/8
      parts[0] === 127 || // 127.0.0.0/8
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || // 172.16.0.0/12
      (parts[0] === 192 && parts[1] === 168) || // 192.168.0.0/16
      (parts[0] === 169 && parts[1] === 254) || // 169.254.0.0/16 (link-local / cloud metadata)
      parts[0] === 0 || // 0.0.0.0/8
      (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) || // 100.64.0.0/10 (carrier-grade NAT)
      (parts[0] === 198 && parts[1] >= 18 && parts[1] <= 19) // 198.18.0.0/15 (benchmark)
    );
  }

  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase();
    return (
      normalized === "::1" || // loopback
      normalized.startsWith("fe80:") || // link-local
      normalized.startsWith("fc") || // unique local (fc00::/7)
      normalized.startsWith("fd") || // unique local (fc00::/7)
      normalized === "::" || // unspecified
      normalized.startsWith("::ffff:127.") || // IPv4-mapped loopback
      normalized.startsWith("::ffff:10.") || // IPv4-mapped 10.x
      normalized.startsWith("::ffff:192.168.") || // IPv4-mapped 192.168.x
      normalized.startsWith("::ffff:169.254.") // IPv4-mapped link-local
    );
  }

  // Unrecognized IP format — fail closed
  return true;
}

export async function validateImageUrl(url: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }

  if (parsed.protocol !== "https:") {
    throw new Error(
      `Only HTTPS URLs are allowed (got ${parsed.protocol})`,
    );
  }

  if (parsed.username || parsed.password) {
    throw new Error("URLs with credentials are not allowed");
  }

  const hostname = parsed.hostname.toLowerCase();

  const isAllowed = ALLOWED_IMAGE_DOMAINS.some((domain) => {
    if (domain.startsWith(".")) {
      return hostname === domain.slice(1) || hostname.endsWith(domain);
    }
    return hostname === domain;
  });

  if (!isAllowed) {
    throw new Error(
      `Domain "${hostname}" is not in the allowed list for image downloads`,
    );
  }

  let resolved: { address: string; family: number };
  try {
    resolved = await dns.promises.lookup(hostname);
  } catch {
    throw new Error(`Failed to resolve hostname: ${hostname}`);
  }

  if (isPrivateIP(resolved.address)) {
    throw new Error(
      `Hostname "${hostname}" resolves to a private IP address`,
    );
  }
}

// Helper function to download image from URL
async function downloadImage(
  url: string,
): Promise<{ filename: string; data: Buffer }> {
  // Validate URL safety BEFORE making any network request
  await validateImageUrl(url);

  try {
    console.log(`Attempting to download image from: ${url}`);

    const response = await fetch(url, {
      redirect: "error", // Reject redirects — prevents redirect-based SSRF bypasses
    });

    console.log(
      `Response status: ${response.status} ${response.statusText}`,
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const contentType = response.headers.get("content-type");
    console.log(`Content-Type: ${contentType}`);

    if (!contentType || !contentType.startsWith("image/")) {
      throw new Error(
        `Response is not an image (Content-Type: ${contentType ?? "missing"}). The URL may be invalid or require authentication.`,
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    console.log(`Downloaded ${buffer.length} bytes`);

    // Reject suspiciously small responses — likely an error page, not a real image
    if (buffer.length < 1024) {
      throw new Error(
        `Downloaded file is too small (${buffer.length} bytes) — likely not a valid image`,
      );
    }

    // Extract filename from URL or create a default one
    const urlPath = new URL(url).pathname;
    const filename = urlPath.split("/").pop() || `image_${Date.now()}.jpg`;

    // Ensure we have a proper image extension
    const hasExtension = /\.(jpg|jpeg|png|gif|webp)$/i.test(filename);
    const finalFilename = hasExtension ? filename : `${filename}.jpg`;

    console.log(`Final filename: ${finalFilename}`);

    return { filename: finalFilename, data: buffer };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(`Failed to download image from ${url}:`, errorMessage);
    throw new Error(`Failed to download image from ${url}: ${errorMessage}`);
  }
}

// Helper function to create zip file from image URLs
async function createImageZip(imageUrls: string[]): Promise<Buffer> {
  const zip = new JSZip();

  console.log(`Starting to create zip from ${imageUrls.length} image URLs`);

  // Download all images in parallel
  const downloadPromises = imageUrls.map((url, index) =>
    downloadImage(url).catch((error) => {
      console.error(
        `Failed to download image ${index + 1} from URL ${url}:`,
        error,
      );
      return null; // Return null for failed downloads
    }),
  );

  const downloadResults = await Promise.all(downloadPromises);
  const validImages = downloadResults.filter((result) => result !== null);

  console.log(
    `Successfully downloaded ${validImages.length} out of ${imageUrls.length} images`,
  );

  if (validImages.length === 0) {
    throw new Error("Failed to download any images");
  }

  // Add valid images to zip
  validImages.forEach((image, index) => {
    // Ensure unique filenames in case of duplicates
    const uniqueFilename = `${index + 1}_${image!.filename}`;
    console.log(
      `Adding image ${uniqueFilename} to zip (${image!.data.length} bytes)`,
    );
    zip.file(uniqueFilename, image!.data);
  });

  // Generate zip buffer
  console.log("Generating zip buffer...");
  const zipBuffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  console.log(`Zip buffer generated: ${zipBuffer.length} bytes`);

  // Verify the zip is valid by re-loading it
  const testZip = new JSZip();
  const loadedZip = await testZip.loadAsync(zipBuffer);
  const fileNames = Object.keys(loadedZip.files);
  console.log(`Zip contents verification (${fileNames.length} files):`, fileNames);

  if (fileNames.length === 0) {
    throw new Error("Zip archive was generated but contains no files");
  }

  return zipBuffer;
}

export const falRouter = router({
  downloadImageZip: protectedProcedure
    .input(
      z.object({
        imageUrls: z.array(
          z.string().url().refine(
            (url) => url.startsWith("https://"),
            { message: "Only HTTPS image URLs are allowed" },
          ),
        ).min(1).max(20),
        triggerWord: z.string().min(1).max(50),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        console.log(
          `Creating downloadable zip file from ${input.imageUrls.length} images...`,
        );

        // Create zip file from images
        const zipBuffer = await createImageZip(input.imageUrls);

        console.log(`Zip file created (${zipBuffer.length} bytes)`);

        // Convert buffer to base64 for transport
        const base64Zip = zipBuffer.toString("base64");

        // Generate filename with trigger word and timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const filename = `lora-training-${input.triggerWord}-${timestamp}.zip`;

        return {
          success: true,
          filename,
          data: base64Zip,
          size: zipBuffer.length,
          imageCount: input.imageUrls.length,
        };
      } catch (error) {
        console.error("Zip download error:", error);
        throw new Error(
          `Failed to create zip archive: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        );
      }
    }),

  trainLora: protectedProcedure
    .input(
      z.object({
        imageUrls: z.array(
          z.string().url().refine(
            (url) => url.startsWith("https://"),
            { message: "Only HTTPS image URLs are allowed" },
          ),
        ).min(1).max(20),
        triggerWord: z.string().min(1).max(50),
        steps: z.number().min(100).max(2000).default(1000),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        ensureFalConfigured();

        console.log(
          `Creating zip file from ${input.imageUrls.length} images...`,
        );

        // Create zip file from images
        const zipBuffer = await createImageZip(input.imageUrls);

        console.log(
          `Zip file created (${zipBuffer.length} bytes), uploading to FAL storage...`,
        );

        // Upload zip file to FAL storage using Blob (better Node.js compat)
        const zipBlob = new Blob([new Uint8Array(zipBuffer)], { type: "application/zip" });
        const zipUrl = await fal.storage.upload(zipBlob);

        console.log(`Zip uploaded to: ${zipUrl}, submitting to queue...`);

        // Submit to queue instead of blocking with subscribe
        const { request_id } = await fal.queue.submit(
          "fal-ai/flux-lora-fast-training",
          {
            input: {
              images_data_url: zipUrl,
              trigger_word: input.triggerWord,
              steps: input.steps,
            },
          },
        );

        console.log(`Training submitted to queue: ${request_id}`);

        return {
          requestId: request_id,
          zipUrl,
        };
      } catch (error) {
        console.error("LoRA training error:", error);
        throw new Error(
          `LoRA training failed: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        );
      }
    }),

  getTrainingStatus: protectedProcedure
    .input(z.object({ requestId: z.string() }))
    .query(async ({ input }) => {
      try {
        ensureFalConfigured();

        const status = await fal.queue.status(
          "fal-ai/flux-lora-fast-training",
          {
            requestId: input.requestId,
            logs: true,
          },
        );

        return {
          status: status.status,
          logs:
            "logs" in status && Array.isArray(status.logs)
              ? (status.logs as { timestamp: string; message: string }[])
              : [],
          ...(status.status === "IN_QUEUE" &&
            "queue_position" in status && {
              queuePosition: (status as any).queue_position as number,
            }),
        };
      } catch (error) {
        console.error("Training status error:", error);
        throw new Error(
          `Failed to get training status: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        );
      }
    }),

  cancelTraining: protectedProcedure
    .input(z.object({ requestId: z.string() }))
    .mutation(async ({ input }) => {
      try {
        ensureFalConfigured();

        await fal.queue.cancel("fal-ai/flux-lora-fast-training", {
          requestId: input.requestId,
        });

        console.log(`Training cancelled: ${input.requestId}`);

        return { success: true };
      } catch (error) {
        console.error("Cancel training error:", error);
        throw new Error(
          `Failed to cancel training: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        );
      }
    }),

  getTrainingResult: protectedProcedure
    .input(z.object({ requestId: z.string() }))
    .query(async ({ input }) => {
      try {
        ensureFalConfigured();

        const result = await fal.queue.result(
          "fal-ai/flux-lora-fast-training",
          {
            requestId: input.requestId,
          },
        );

        return {
          data: result.data as Record<string, unknown>,
          requestId: result.requestId,
        };
      } catch (error) {
        console.error("Training result error:", error);
        throw new Error(
          `Failed to get training result: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        );
      }
    }),
});
