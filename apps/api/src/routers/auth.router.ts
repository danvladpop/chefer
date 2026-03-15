import { z } from 'zod';

import { router, publicProcedure } from '../lib/trpc.js';
import { authService } from '../application/auth/auth.service.js';

// ─── Schemas ──────────────────────────────────────────────────────────────────

const registerSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(100, 'Password too long'),
  firstName: z.string().min(1).max(50).optional(),
  lastName: z.string().min(1).max(50).optional(),
});

const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

// ─── Router ───────────────────────────────────────────────────────────────────

export const authRouter = router({
  register: publicProcedure
    .input(registerSchema)
    .mutation(async ({ input, ctx }) => {
      return authService.register(input, ctx.res);
    }),

  login: publicProcedure
    .input(loginSchema)
    .mutation(async ({ input, ctx }) => {
      return authService.login(input, ctx.res);
    }),

  logout: publicProcedure.mutation(async ({ ctx }) => {
    await authService.logout(ctx.sessionToken, ctx.res);
    return { success: true as const };
  }),

  me: publicProcedure.query(({ ctx }) => {
    return ctx.user ?? null;
  }),
});
