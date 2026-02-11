import { betterAuth } from "better-auth";
import { siwe } from "better-auth/plugins/siwe";
import Database from "better-sqlite3";
import { verifyMessage } from "viem";
import crypto from "node:crypto";

export const auth = betterAuth({
  database: new Database("auth.db"),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  plugins: [
    siwe({
      domain: new URL(process.env.BETTER_AUTH_URL || "http://localhost:3000")
        .host,
      anonymous: true,
      getNonce: async () => crypto.randomBytes(32).toString("hex"),
      verifyMessage: async ({ message, signature, address }) => {
        const valid = await verifyMessage({
          address: address as `0x${string}`,
          message,
          signature: signature as `0x${string}`,
        });
        if (valid && process.env.ALLOWED_ADDRESSES) {
          const allowed = process.env.ALLOWED_ADDRESSES.split(",").map((a) =>
            a.trim().toLowerCase(),
          );
          return allowed.includes(address.toLowerCase());
        }
        return valid;
      },
    }),
  ],
});
