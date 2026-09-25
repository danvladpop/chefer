import type { NextFunction, Request, Response } from 'express';
import type { UserProfile } from '@chefer/types';
import { isMobileClient, resolveRequestAuth } from '../../../lib/session-auth.js';
import type { Context } from '../../../lib/trpc.js';

declare module 'express' {
  interface Request {
    user?: UserProfile;
    requestId?: string;
  }
}

/**
 * Middleware that creates the tRPC context from an Express request/response pair.
 */
export async function createContext(req: Request, res: Response): Promise<Context> {
  const requestId = (req.headers['x-request-id'] as string | undefined) ?? crypto.randomUUID();

  // req.ip honours `trust proxy` (one hop: Caddy), so it is the address the
  // proxy saw. The raw leftmost X-Forwarded-For was client-controlled: a
  // rotating header bypassed the login and reset rate limits (audit
  // F-AUTH-2-1).
  const ipAddress = req.ip ?? req.socket.remoteAddress ?? 'unknown';

  const { user, sessionToken } = await resolveRequestAuth(req);

  return {
    user,
    requestId,
    ipAddress,
    sessionToken,
    isMobileClient: isMobileClient(req),
    res,
  };
}

/**
 * Express middleware to add request ID to all responses.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = (req.headers['x-request-id'] as string | undefined) ?? crypto.randomUUID();
  req.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);
  next();
}

/**
 * Express middleware that requires authentication.
 * Attaches the user to req.user.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const { user } = await resolveRequestAuth(req);

  if (!user) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
    return;
  }

  req.user = user;
  next();
}
