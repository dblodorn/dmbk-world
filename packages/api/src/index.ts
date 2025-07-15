import { router } from './trpc';
import { helloRouter } from './features/hello';
import { falRouter } from './features/fal';

export const appRouter = router({
  hello: helloRouter,
  fal: falRouter,
});

export type AppRouter = typeof appRouter;