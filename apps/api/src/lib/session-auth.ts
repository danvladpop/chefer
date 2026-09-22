import type { Request } from 'express';
import { prisma } from '@chefer/database';
import type { UserProfile } from '@chefer/types';

const SESSION_COOKIE = 'chefer_session';

/**
 * Extracts the Bearer token from the Authorization header.
 */
export function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice(7);
}

/**
 * Extracts the session token from the cookie header.
 */
export function extractSessionToken(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) {
    return null;
  }
  const cookie = cookieHeader
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`));

  return cookie ? (cookie.split('=')[1] ?? null) : null;
}

/**
 * Resolves a user from a session token stored in the database.
 */
export async function resolveUserFromSession(token: string): Promise<UserProfile | null> {
  try {
    const session = await prisma.session.findUnique({
      where: { sessionToken: token },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            firstName: true,
            role: true,
            planTier: true,
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
      firstName: session.user.firstName,
      role: session.user.role,
      planTier: session.user.planTier,
      image: session.user.image,
    };
  } catch {
    return null;
  }
}

export interface RequestAuth {
  user: UserProfile | null;
  sessionToken: string | null;
}

/**
 * Resolves the authenticated user for a request from either credential the API
 * accepts: the `chefer_session` cookie (web) or `Authorization: Bearer
 * <sessionToken>` (mobile). Both carry the same DB Session token; the cookie
 * wins when both are present and valid.
 */
export async function resolveRequestAuth(req: Request): Promise<RequestAuth> {
  const cookieToken = extractSessionToken(req.headers.cookie);
  if (cookieToken) {
    const user = await resolveUserFromSession(cookieToken);
    if (user) {
      return { user, sessionToken: cookieToken };
    }
  }

  const bearerToken = extractBearerToken(req.headers.authorization);
  if (bearerToken) {
    const user = await resolveUserFromSession(bearerToken);
    if (user) {
      return { user, sessionToken: bearerToken };
    }
  }

  return { user: null, sessionToken: null };
}

/**
 * True when the request identifies itself as the native mobile app
 * (`x-chefer-client: mobile`). Auth responses include the session token in the
 * body only for such clients — the token never appears in bodies sent to
 * browsers, which authenticate via the HttpOnly cookie alone.
 */
export function isMobileClient(req: Request): boolean {
  return req.headers['x-chefer-client'] === 'mobile';
}
