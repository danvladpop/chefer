import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { asyncHandler } from './async-handler.js';
import { consume } from './rate-limit.js';
import { resolveRequestAuth, type RequestAuth } from './session-auth.js';

// ─── Rate limits for the plain-Express routes (Phase 1 guardrails) ────────────
// /trpc has a blunt per-IP express-rate-limit in index.ts; the streaming and
// raw-body routes mounted beside it had none. These limits are per USER (the
// session behind the cookie or bearer token), falling back to per IP for an
// unauthenticated request, on the same in-memory sliding window the tRPC
// procedures use (lib/rate-limit.ts `consume`).
//
// They sit in front of the routers in index.ts, before any body is read, so a
// flood never reaches the parsers. The auth they resolve is cached on
// `res.locals` and reused by the handler (`authOnce`) — one session lookup per
// request, not two.

export interface RouteLimit {
  /** Bucket name — routes never share buckets. */
  name: string;
  /** Hits allowed per window. */
  max: number;
  windowMs: number;
  /** Key by user when signed in (default). `false` = always per IP (no session lookup). */
  perUser?: boolean;
}

const MINUTE_MS = 60_000;

export const ROUTE_LIMITS = {
  /** AI chef chat: the daily quota caps cost, this caps bursts. */
  chat: { name: 'http.chat', max: 10, windowMs: MINUTE_MS },
  /** Photo uploads (also capped per day and by stored bytes, DB-backed). */
  uploads: { name: 'http.uploads', max: 20, windowMs: MINUTE_MS },
  /** Meal photo scans (premium, 10/day quota on top). */
  scanMeal: { name: 'http.scan-meal', max: 10, windowMs: MINUTE_MS },
  /** SSE recipe-image stream — clients reconnect, so a looser bound. */
  recipeImages: { name: 'http.recipe-images', max: 30, windowMs: MINUTE_MS },
  /** Public health check (does a DB round trip). Per IP; monitors poll once a minute. */
  health: { name: 'http.health', max: 60, windowMs: MINUTE_MS, perUser: false },
} as const satisfies Record<string, RouteLimit>;

export const ROUTE_RATE_LIMIT_MESSAGE = 'Too many requests. Wait a minute and try again.';

const AUTH_KEY = 'chefer.requestAuth';

/**
 * The request's auth, resolved at most once per request: the rate limiter
 * resolves it first, the route handler reuses it.
 */
export async function authOnce(req: Request, res: Response): Promise<RequestAuth> {
  const cached = res.locals[AUTH_KEY] as RequestAuth | undefined;
  if (cached) return cached;
  const auth = await resolveRequestAuth(req);
  res.locals[AUTH_KEY] = auth;
  return auth;
}

/** The bucket key: the user when signed in, else the client IP. */
async function callerKey(req: Request, res: Response, perUser: boolean): Promise<string> {
  if (perUser) {
    const { user } = await authOnce(req, res);
    if (user) return `user:${user.id}`;
  }
  return `ip:${req.ip ?? req.socket.remoteAddress ?? 'unknown'}`;
}

/**
 * Express middleware: 429 + `{ error }` (the plain-string shape every client
 * shows verbatim) + Retry-After when the caller is over `limit`.
 */
export function routeRateLimit(limit: RouteLimit): RequestHandler {
  return asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const key = await callerKey(req, res, limit.perUser !== false);
    if (!consume(`${limit.name}:${key}`, limit.max, limit.windowMs)) {
      res.setHeader('Retry-After', String(Math.ceil(limit.windowMs / 1000)));
      res.status(429).json({ error: ROUTE_RATE_LIMIT_MESSAGE });
      return;
    }
    next();
  });
}
