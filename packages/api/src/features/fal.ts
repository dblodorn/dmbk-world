import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../trpc";
import { requireFalApiKey, getTrainingPriceUsd } from "../env";
import { fal } from "@fal-ai/client";
import JSZip from "jszip";
import type { Hex } from "viem";
import {
  isPaymentExempt,
  verifyPaymentTx,
  getEthPriceFromUniswap,
  calculateRequiredEthWei,
  sendRefund,
} from "./payment";

// Configure fal client lazily — credentials are validated per-request
function ensureFalConfigured() {
  const key = requireFalApiKey();
  fal.config({ credentials: key });
}

// Helper function to download image from URL
async function downloadImage(
  url: string,
): Promise<{ filename: string; data: Buffer }> {
  try {
    console.log(`Attempting to download image from: ${url}`);

    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
    });

    console.log(
      `Response status: ${response.status} ${response.statusText} (final URL: ${response.url})`,
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
        imageUrls: z.array(z.string().url()).min(1).max(20),
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
        imageUrls: z.array(z.string().url()).min(1).max(20),
        triggerWord: z.string().min(1).max(50),
        steps: z.number().min(100).max(2000).default(1000),
        paymentTxHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const walletAddress = ctx.session.user.walletAddress;
      const exempt = isPaymentExempt(walletAddress);

      // ── Payment verification ──────────────────────────────────────
      let paymentValue: bigint | null = null;

      if (!exempt) {
        if (!input.paymentTxHash) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Payment required. Please submit a payment transaction to train.",
          });
        }

        try {
          const trainingPriceUsd = getTrainingPriceUsd();
          const ethPriceUsd = await getEthPriceFromUniswap();
          const requiredEthWei = calculateRequiredEthWei(ethPriceUsd, trainingPriceUsd);

          const verification = await verifyPaymentTx(
            input.paymentTxHash as Hex,
            requiredEthWei,
          );
          paymentValue = verification.value;

          console.log(
            `Payment verified: ${input.paymentTxHash} from ${verification.from} (${verification.value} wei)`,
          );
        } catch (error) {
          const msg = error instanceof Error ? error.message : "Payment verification failed";
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Payment verification failed: ${msg}`,
          });
        }
      } else {
        console.log(`Payment exempt for wallet: ${walletAddress}`);
      }

      // ── Training execution ────────────────────────────────────────
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
          refundTxHash: null as string | null,
        };
      } catch (error) {
        console.error("LoRA training error:", error);

        // ── Auto-refund on FAL failure ────────────────────────────────
        let refundTxHash: string | null = null;
        if (!exempt && paymentValue && input.paymentTxHash) {
          try {
            console.log(
              `FAL failed — initiating refund of ${paymentValue} wei to ${walletAddress}`,
            );
            refundTxHash = await sendRefund(walletAddress, paymentValue);
            console.log(`Refund sent: ${refundTxHash}`);
          } catch (refundError) {
            console.error("Refund failed:", refundError);
            // Include refund failure info in the error message
            const refundMsg = refundError instanceof Error ? refundError.message : "Unknown refund error";
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: `Training failed and refund also failed: ${refundMsg}. Original payment tx: ${input.paymentTxHash}. Please contact support.`,
            });
          }
        }

        const trainingMsg = error instanceof Error ? error.message : "Unknown error";
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: refundTxHash
            ? `Training failed. Your ETH has been refunded (tx: ${refundTxHash}). Error: ${trainingMsg}`
            : `LoRA training failed: ${trainingMsg}`,
        });
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
