import { z } from "zod";
import { publicProcedure, router } from "../trpc";
import { env } from "../env";
import * as fal from "@fal-ai/serverless-client";
import JSZip from "jszip";

// Configure fal client
fal.config({
  credentials: env.FAL_AI_API_KEY,
});

// Helper function to download image from URL
async function downloadImage(
  url: string
): Promise<{ filename: string; data: Buffer }> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.statusText}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    // Extract filename from URL or create a default one
    const urlPath = new URL(url).pathname;
    const filename = urlPath.split("/").pop() || `image_${Date.now()}.jpg`;

    // Ensure we have a proper image extension
    const hasExtension = /\.(jpg|jpeg|png|gif|webp)$/i.test(filename);
    const finalFilename = hasExtension ? filename : `${filename}.jpg`;

    return { filename: finalFilename, data: buffer };
  } catch (error) {
    throw new Error(
      `Failed to download image from ${url}: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

// Helper function to create zip file from image URLs
async function createImageZip(imageUrls: string[]): Promise<Buffer> {
  const zip = new JSZip();

  // Download all images in parallel
  const downloadPromises = imageUrls.map((url, index) =>
    downloadImage(url).catch((error) => {
      console.error(`Failed to download image ${index + 1}:`, error);
      return null; // Return null for failed downloads
    })
  );

  const downloadResults = await Promise.all(downloadPromises);
  const validImages = downloadResults.filter((result) => result !== null);

  if (validImages.length === 0) {
    throw new Error("Failed to download any images");
  }

  // Add valid images to zip
  validImages.forEach((image, index) => {
    // Ensure unique filenames in case of duplicates
    const uniqueFilename = `${index + 1}_${image!.filename}`;
    zip.file(uniqueFilename, image!.data);
  });

  // Generate zip buffer
  const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
  return zipBuffer;
}

export const falRouter = router({
  test: publicProcedure
    .input(z.object({ message: z.string() }))
    .query(({ input }) => {
      // Verify that the FAL AI API key is available
      const hasApiKey = !!env.FAL_AI_API_KEY;

      return {
        message: `FAL API: ${input.message}`,
        apiKeyConfigured: hasApiKey,
        apiKeyPreview: hasApiKey
          ? `${env.FAL_AI_API_KEY.slice(0, 8)}...`
          : "Not configured",
      };
    }),

  trainLora: publicProcedure
    .input(
      z.object({
        imageUrls: z.array(z.string().url()).min(1).max(20),
        triggerWord: z.string().min(1).max(50),
        steps: z.number().min(100).max(2000).default(1000),
      })
    )
    .mutation(async ({ input }) => {
      try {
        console.log(
          `Creating zip file from ${input.imageUrls.length} images...`
        );

        // Create zip file from images
        const zipBuffer = await createImageZip(input.imageUrls);

        console.log(
          `Zip file created (${zipBuffer.length} bytes), uploading to FAL storage...`
        );

        // Upload zip file to FAL storage
        const zipFile = new File(
          [new Uint8Array(zipBuffer)],
          "training_images.zip",
          {
            type: "application/zip",
          }
        );
        const zipUrl = await fal.storage.upload(zipFile);

        console.log(`Zip uploaded to: ${zipUrl}, starting LoRA training...`);

        // Start LoRA training with uploaded zip
        const result = await fal.subscribe("fal-ai/flux-lora-fast-training", {
          input: {
            images_data_url: zipUrl,
            trigger_word: input.triggerWord,
            steps: input.steps,
          },
          logs: true,
          onQueueUpdate: (update: any) => {
            console.log("Queue update:", update);
          },
        });

        return {
          success: true,
          data: result,
          message: "LoRA training completed successfully",
          zipUrl: zipUrl, // Include zip URL for reference
        };
      } catch (error) {
        console.error("LoRA training error:", error);
        throw new Error(
          `LoRA training failed: ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        );
      }
    }),

  getTrainingStatus: publicProcedure
    .input(z.object({ requestId: z.string() }))
    .query(async ({ input }) => {
      try {
        // Note: Status checking might not be directly available in this version
        // For now, we'll return a placeholder response
        return {
          success: true,
          data: {
            status: "IN_PROGRESS",
            requestId: input.requestId,
            message: "Training status check not yet implemented",
          },
        };
      } catch (error) {
        console.error("Training status error:", error);
        throw new Error(
          `Failed to get training status: ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        );
      }
    }),
});
