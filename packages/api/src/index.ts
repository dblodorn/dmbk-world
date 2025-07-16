import { router } from "./trpc";
import { falRouter } from "./features/fal";
import { arenaRouter } from "./features/arena";

export const appRouter = router({
  fal: falRouter,
  arena: arenaRouter,
});

export type AppRouter = typeof appRouter;
