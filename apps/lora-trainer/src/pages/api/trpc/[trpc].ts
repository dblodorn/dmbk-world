import { createNextApiHandler } from "@trpc/server/adapters/next";
import { appRouter } from "@dmbk-world/api";
import type { Context } from "@dmbk-world/api";
import { auth } from "@/lib/auth";
import { fromNodeHeaders } from "better-auth/node";

export default createNextApiHandler({
  router: appRouter,
  createContext: async ({ req }): Promise<Context> => {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    return {
      session: session
        ? {
            user: {
              id: session.user.id,
              walletAddress:
                (session.user as Record<string, unknown>).walletAddress as string ?? "",
            },
          }
        : null,
    };
  },
});
