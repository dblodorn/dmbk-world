import { createNextApiHandler } from '@trpc/server/adapters/next';
import { appRouter } from '@dmbk-world/api';

export default createNextApiHandler({
  router: appRouter,
  createContext: () => ({}),
});