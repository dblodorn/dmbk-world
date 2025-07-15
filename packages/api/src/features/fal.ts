import { z } from 'zod';
import { publicProcedure, router } from '../trpc';

export const falRouter = router({
  test: publicProcedure
    .input(z.object({ message: z.string() }))
    .query(({ input }) => {
      return {
        message: `FAL API: ${input.message}`,
      };
    }),
});