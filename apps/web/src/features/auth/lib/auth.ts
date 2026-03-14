import type { UserProfile, UserRole } from '@chefer/types';

const AUTH_COOKIE_NAME = 'chefer_session';
const AUTH_HEADER = 'Authorization';

/**
 * Retrieves the session token from a cookie string.
 */
export function getSessionTokenFromCookies(cookieHeader: string): string | null {
  const cookies = cookieHeader.split(';').map((c) => c.trim());
  const sessionCookie = cookies.find((c) => c.startsWith(`${AUTH_COOKIE_NAME}=`));
  if (!sessionCookie) {
    return null;
  }
  return sessionCookie.split('=')[1] ?? null;
}

/**
 * Extracts the Bearer token from an Authorization header.
 */
export function getBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice(7);
}

/**
 * Checks if the user has the required role.
 */
export function hasRole(user: UserProfile, requiredRole: UserRole): boolean {
  const roleHierarchy: Record<UserRole, number> = {
    USER: 0,
    MODERATOR: 1,
    ADMIN: 2,
  };

  const userLevel = roleHierarchy[user.role];
  const requiredLevel = roleHierarchy[requiredRole];

  return userLevel >= requiredLevel;
}

/**
 * Checks if the user is an admin.
 */
export function isAdmin(user: UserProfile): boolean {
  return user.role === 'ADMIN';
}

/**
 * Checks if the user is a moderator or admin.
 */
export function isModerator(user: UserProfile): boolean {
  return user.role === 'MODERATOR' || user.role === 'ADMIN';
}

/**
 * Creates a sanitized user profile from a full user object.
 * Strips sensitive fields like passwordHash.
 */
export function toUserProfile(user: {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  image: string | null;
}): UserProfile {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    image: user.image,
  };
}

/**
 * Generates a cryptographically secure random session token.
 */
export function generateSessionToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Cookie options for secure session cookies.
 */
export const SESSION_COOKIE_OPTIONS = {
  name: AUTH_COOKIE_NAME,
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 60 * 60 * 24 * 30, // 30 days
};

export { AUTH_COOKIE_NAME, AUTH_HEADER };
