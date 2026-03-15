import type { Request, Response, NextFunction } from 'express';

import type { UserProfile } from '@chefer/types';
import { prisma } from '@chefer/database';

import type { Context } from '../../../lib/trpc.js';
import { env } from '../../../lib/env.js';

declare module 'express' {
  interface Request {
    user?: UserProfile;
    requestId?: string;
  }
}

/**
 * Extracts the Bearer token from the Authorization header.
 */
function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice(7);
}

/**
 * Extracts the session token from the cookie header.
 */
function extractSessionToken(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) {
    return null;
  }
  const sessionCookieName = 'chefer_session';
  const cookie = cookieHeader
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${sessionCookieName}=`));

  return cookie ? (cookie.split('=')[1] ?? null) : null;
}

/**
 * Resolves a user from a session token stored in the database.
 */
async function resolveUserFromSession(token: string): Promise<UserProfile | null> {
  try {
    const session = await prisma.session.findUnique({
      where: { sessionToken: token },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            image: true,
          },
        },
      },
    });

    if (!session || session.expires < new Date()) {
      return null;
    }

    return {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      role: session.user.role as UserProfile['role'],
      image: session.user.image,
    };
  } catch {
    return null;
  }
}

/**
 * Middleware that creates the tRPC context from an Express request/response pair.
 */
export async function createContext(req: Request, res: Response): Promise<Context> {
  const requestId =
    (req.headers['x-request-id'] as string | undefined) ??
    crypto.randomUUID();

  const ipAddress =
    (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ??
    req.socket.remoteAddress ??
    'unknown';

  // Try to resolve user from session or bearer token
  let user: UserProfile | null = null;
  let activeSessionToken: string | null = null;

  const cookieSessionToken = extractSessionToken(req.headers.cookie);
  if (cookieSessionToken) {
    user = await resolveUserFromSession(cookieSessionToken);
    if (user) activeSessionToken = cookieSessionToken;
  }

  if (!user) {
    const bearerToken = extractBearerToken(req.headers.authorization);
    if (bearerToken) {
      // In production, verify JWT here:
      // user = await verifyJwt(bearerToken, env.JWT_SECRET);
      void bearerToken; // placeholder
    }
  }

  return { user, requestId, ipAddress, sessionToken: activeSessionToken, res };
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
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const sessionToken = extractSessionToken(req.headers.cookie);
  const bearerToken = extractBearerToken(req.headers.authorization);

  let user: UserProfile | null = null;

  if (sessionToken) {
    user = await resolveUserFromSession(sessionToken);
  }

  if (!user && bearerToken) {
    // Verify JWT in production
    void bearerToken;
  }

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

// Expose env for use in middleware
void env;
