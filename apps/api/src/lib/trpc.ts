import { initTRPC, TRPCError } from '@trpc/server';
import type { Response } from 'express';
import superjson from 'superjson';
import { ZodError } from 'zod';
import type { UserProfile } from '@chefer/types';
import { ConflictCause } from './conflict.js';
import { isPremiumUser } from './entitlements.js';
import { logger } from './logger.js';

// ─── Context ─────────────────────────────────────────────────────────────────

export interface Context {
  user: UserProfile | null;
  requestId: string;
  ipAddress: string;
  sessionToken: string | null;
  /** Request carried `x-chefer-client: mobile` — auth responses may include the session token. */
  isMobileClient: boolean;
  res: Response;
}

export type ProtectedContext = Context & {
  user: UserProfile;
};

// ─── tRPC Initialization ──────────────────────────────────────────────────────

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    // Unexpected errors (Prisma, bugs) arrive as INTERNAL_SERVER_ERROR with
    // the original message: repo paths, source snippets and constraint names
    // leaked to clients (audit F-X-4-5). Deliberate TRPCErrors keep their
    // friendly message; the raw one stays in the server log and Sentry.
    const unexpected =
      error.code === 'INTERNAL_SERVER_ERROR' &&
      error.cause !== undefined &&
      !(error.cause instanceof TRPCError) &&
      error.message === error.cause.message;
    return {
      ...shape,
      message: unexpected ? 'Something went wrong on our side. Please try again.' : shape.message,
      data: {
        ...shape.data,
        zodError: error.cause instanceof ZodError ? error.cause.flatten() : null,
        // CONFLICT errors that carry the server's current version (lib/conflict.ts).
        conflict: error.cause instanceof ConflictCause ? error.cause.payload : null,
      },
    };
  },
});

// ─── Middleware ───────────────────────────────────────────────────────────────

/**
 * Request logging middleware — one structured line per procedure call, with
 * the request ID threaded through so a Sentry event's requestId greps
 * straight to its log lines.
 */
const timingMiddleware = t.middleware(async ({ ctx, next, path, type }) => {
  const start = Date.now();
  const result = await next();

  logger.info(
    {
      requestId: ctx.requestId,
      type,
      path,
      durationMs: Date.now() - start,
      ok: result.ok,
      ...(ctx.user && { userId: ctx.user.id }),
    },
    `trpc ${path}`,
  );

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
 * Premium middleware — ensures the user is on the PREMIUM tier (admins count
 * as premium, via lib/entitlements). Free users receive a FORBIDDEN error the
 * frontend maps to an "Upgrade plan" prompt.
 */
const isPremium = t.middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'You must be logged in to perform this action',
    });
  }
  if (!isPremiumUser(ctx.user)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'This feature requires a premium plan. Upgrade to unlock it.',
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
export const protectedProcedure = t.procedure.use(timingMiddleware).use(isAuthenticated);
export const premiumProcedure = t.procedure.use(timingMiddleware).use(isPremium);
export const adminProcedure = t.procedure.use(timingMiddleware).use(isAdmin);
export const mergeRouters = t.mergeRouters;

export type { AppRouter } from '../routers/index.js';
