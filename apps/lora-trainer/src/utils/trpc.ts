import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@dmbk-world/api';

export const trpc = createTRPCReact<AppRouter>();