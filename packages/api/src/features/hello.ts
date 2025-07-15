import { z } from 'zod';
import { publicProcedure, router } from '../trpc';

export const helloRouter = router({
  world: publicProcedure
    .input(z.object({ text: z.string() }))
    .query(({ input }) => {
      return {
        greeting: `Hello ${input.text}!`,
      };
    }),
});