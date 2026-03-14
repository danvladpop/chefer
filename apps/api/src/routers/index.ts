import { router } from '../lib/trpc.js';
import { userRouter } from './user.router.js';

export const appRouter = router({
  user: userRouter,
});

export type AppRouter = typeof appRouter;
