import { router } from '../lib/trpc.js';
import { authRouter } from './auth.router.js';
import { userRouter } from './user.router.js';

export const appRouter = router({
  auth: authRouter,
  user: userRouter,
});

export type AppRouter = typeof appRouter;
