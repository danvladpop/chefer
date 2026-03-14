import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import { ZodError } from 'zod';

import type { UserProfile } from '@chefer/types';

// ─── Context ─────────────────────────────────────────────────────────────────

export interface Context {
  user: UserProfile | null;
  requestId: string;
  ipAddress: string;
}

export type ProtectedContext = Context & {
  user: UserProfile;
};

// ─── tRPC Initialization ──────────────────────────────────────────────────────

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

// ─── Middleware ───────────────────────────────────────────────────────────────

/**
 * Logging middleware — logs all procedure calls in development.
 */
const timingMiddleware = t.middleware(async ({ next, path, type }) => {
  const start = Date.now();
  const result = await next();
  const duration = Date.now() - start;

  if (process.env['NODE_ENV'] === 'development') {
    const status = result.ok ? '✅' : '❌';
    console.log(`${status} ${type} ${path} (${duration}ms)`);
  }

  return result;
});

/**
 * Auth middleware — ensures the user is authenticated.
 */
const isAuthenticated = t.middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'You must be logged in to perform this action',
    });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

/**
 * Admin middleware — ensures the user has admin role.
 */
const isAdmin = t.middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'You must be logged in to perform this action',
    });
  }
  if (ctx.user.role !== 'ADMIN') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'You do not have permission to perform this action',
    });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

// ─── Exports ──────────────────────────────────────────────────────────────────

export const router = t.router;
export const publicProcedure = t.procedure.use(timingMiddleware);
export const protectedProcedure = t.procedure
  .use(timingMiddleware)
  .use(isAuthenticated);
export const adminProcedure = t.procedure
  .use(timingMiddleware)
  .use(isAdmin);
export const mergeRouters = t.mergeRouters;

export type { AppRouter } from '../routers/index.js';
