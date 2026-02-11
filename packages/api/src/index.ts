import { router } from "./trpc";
import { falRouter } from "./features/fal";
import { arenaRouter } from "./features/arena";
import { paymentRouter } from "./features/payment";

export const appRouter = router({
  fal: falRouter,
  arena: arenaRouter,
  payment: paymentRouter,
});

export type AppRouter = typeof appRouter;
export type { Context } from "./trpc";
