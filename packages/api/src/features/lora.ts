import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { publicProcedure, protectedProcedure, router } from "../trpc";
import { getDb, ensureLoraTable } from "../db";
import crypto from "node:crypto";

function generateId(): string {
  return crypto.randomBytes(16).toString("hex");
}

/**
 * Create a pending lora_trainings record. Called internally from trainLora.
 */
export async function createPendingLora(params: {
  requestId: string;
  walletAddress: string;
  triggerWord: string;
  steps: number;
  imageUrls: string[];
}): Promise<void> {
  await ensureLoraTable();
  const db = getDb();
  await db
    .insertInto("lora_trainings")
    .values({
      id: generateId(),
      request_id: params.requestId,
      wallet_address: params.walletAddress,
      trigger_word: params.triggerWord,
      steps: params.steps,
      image_urls: JSON.stringify(params.imageUrls),
      lora_weights_url: null,
      status: "pending",
      created_at: new Date().toISOString(),
    })
    .execute();
}

export const loraRouter = router({
  complete: protectedProcedure
    .input(
      z.object({
        requestId: z.string().min(1),
        loraWeightsUrl: z.string().url(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      await ensureLoraTable();
      const db = getDb();
      const walletAddress = ctx.session.user.walletAddress;

      // Verify the record exists and belongs to this wallet
      const existing = await db
        .selectFrom("lora_trainings")
        .select(["id", "wallet_address", "status"])
        .where("request_id", "=", input.requestId)
        .executeTakeFirst();

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No training record found for this request ID.",
        });
      }

      if (existing.wallet_address.toLowerCase() !== walletAddress.toLowerCase()) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not the owner of this training record.",
        });
      }

      if (existing.status === "completed") {
        // Already completed — idempotent, just return
        return { success: true };
      }

      await db
        .updateTable("lora_trainings")
        .set({
          lora_weights_url: input.loraWeightsUrl,
          status: "completed",
        })
        .where("id", "=", existing.id)
        .execute();

      return { success: true };
    }),

  list: publicProcedure.query(async () => {
    await ensureLoraTable();
    const db = getDb();

    const rows = await db
      .selectFrom("lora_trainings")
      .select([
        "id",
        "request_id",
        "wallet_address",
        "trigger_word",
        "steps",
        "image_urls",
        "lora_weights_url",
        "created_at",
      ])
      .where("status", "=", "completed")
      .orderBy("created_at", "desc")
      .execute();

    return rows.map((row) => ({
      id: row.id,
      requestId: row.request_id,
      walletAddress: row.wallet_address,
      triggerWord: row.trigger_word,
      steps: row.steps,
      imageUrls: JSON.parse(row.image_urls) as string[],
      loraWeightsUrl: row.lora_weights_url,
      createdAt: row.created_at,
    }));
  }),
});
