import { z } from 'zod';
import { authService } from '../application/auth/auth.service.js';
import { assertWithinRateLimit } from '../lib/rate-limit.js';
import { publicProcedure, router } from '../lib/trpc.js';

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

// ─── Rate limits ──────────────────────────────────────────────────────────────
// Per IP: bcrypt-backed credential checks must not be brute-forceable, and
// register must not be a free account-farming endpoint.

const AUTH_ATTEMPTS_MAX = 10;
const AUTH_WINDOW_MS = 15 * 60 * 1000;

// ─── Router ───────────────────────────────────────────────────────────────────

export const authRouter = router({
  register: publicProcedure.input(registerSchema).mutation(async ({ input, ctx }) => {
    assertWithinRateLimit('auth.register', ctx.ipAddress, AUTH_ATTEMPTS_MAX, AUTH_WINDOW_MS);
    return authService.register(input, ctx.res);
  }),

  login: publicProcedure.input(loginSchema).mutation(async ({ input, ctx }) => {
    assertWithinRateLimit('auth.login', ctx.ipAddress, AUTH_ATTEMPTS_MAX, AUTH_WINDOW_MS);
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
