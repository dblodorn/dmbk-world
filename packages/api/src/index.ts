import { router } from "./trpc";
import { falRouter } from "./features/fal";
import { arenaRouter } from "./features/arena";
import { paymentRouter } from "./features/payment";
import { loraRouter } from "./features/lora";

export const appRouter = router({
  fal: falRouter,
  arena: arenaRouter,
  payment: paymentRouter,
  lora: loraRouter,
});

export type AppRouter = typeof appRouter;
export type { Context } from "./trpc";
