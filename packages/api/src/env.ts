import { config } from "dotenv";
import { z } from "zod";

// Load environment variables from .env.local files
// Look for .env.local in the workspace root and current directory
config({ path: "../../.env.local" }); // workspace root
config({ path: ".env.local" }); // current directory
config(); // default .env file

// Define the environment schema
const envSchema = z.object({
  FAL_AI_API_KEY: z.string().min(1, "FAL_AI_API_KEY is required"),
});

// Validate environment variables
const envResult = envSchema.safeParse(process.env);

if (!envResult.success) {
  console.error("❌ Invalid environment variables:");
  console.error(envResult.error.format());
  throw new Error("Invalid environment variables");
}

export const env = envResult.data;
