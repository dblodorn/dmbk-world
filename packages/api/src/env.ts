import { config } from "dotenv";
import { z } from "zod";

// Load environment variables from .env.local files
// Look for .env.local in the workspace root and current directory
config({ path: "../../.env.local" }); // workspace root
config({ path: ".env.local" }); // current directory
config(); // default .env file

// Define the environment schema — all keys optional at load time
// so that routes that don't need them can still work.
const envSchema = z.object({
  FAL_AI_API_KEY: z.string().optional(),
});

// Parse environment variables (will not throw since all keys are optional)
const envResult = envSchema.safeParse(process.env);

export const env = envResult.success
  ? envResult.data
  : { FAL_AI_API_KEY: undefined };

/**
 * Require a specific env variable at runtime. Call this inside procedures
 * that need the key so that only those routes fail — not the entire router.
 */
export function requireFalApiKey(): string {
  const key = env.FAL_AI_API_KEY;
  if (!key) {
    throw new Error(
      "FAL_AI_API_KEY is not configured. Set it in .env.local to use fal.ai features.",
    );
  }
  return key;
}
