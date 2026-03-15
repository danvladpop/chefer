import { router } from '../lib/trpc.js';
import { authRouter } from './auth.router.js';
import { preferencesRouter } from './preferences.router.js';
import { userRouter } from './user.router.js';

export const appRouter = router({
  auth: authRouter,
  preferences: preferencesRouter,
  user: userRouter,
});

export type AppRouter = typeof appRouter;
