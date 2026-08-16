import { headers } from 'next/headers';
import { createServerClient } from '@/lib/trpc-server';
import type { UserProfile } from '@chefer/types';
import { AUTH_COOKIE_NAME } from './auth';

/**
 * Resolves the signed-in user by validating the session cookie against the API.
 *
 * The `chefer_session` cookie is opaque: its presence says nothing about whether
 * the session row still exists or has expired. Server components that gate on
 * "is this user signed in" must call this rather than testing for the cookie —
 * a stale cookie would otherwise bounce the user to /dashboard from /login,
 * leaving them stuck on a page where every query fails with UNAUTHORIZED.
 *
 * Returns null when there is no session, the session is invalid, or the API is
 * unreachable. Server-only — depends on `next/headers`.
 */
export async function getSessionUser(): Promise<UserProfile | null> {
  const headerStore = await headers();
  const cookieHeader = headerStore.get('cookie') ?? '';

  // Cheap short-circuit: no cookie at all means no round-trip to the API.
  if (!cookieHeader.includes(`${AUTH_COOKIE_NAME}=`)) {
    return null;
  }

  try {
    return await createServerClient(cookieHeader).auth.me.query();
  } catch {
    // Treat an unreachable or erroring API as "not signed in" so the caller
    // renders the public view instead of throwing.
    return null;
  }
}
