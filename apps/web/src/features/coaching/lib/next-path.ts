// "Sign in, then come back to the invite" (spec §2.3, ADR 0002). Only an invite
// join page (coaching or household) may be returned to, so `?next=` can never
// become an open redirect.

// Kept local (not imported from @chefer/types) so the edge middleware does not
// bundle the whole types package; next-path.test.ts pins it to HOUSEHOLD_JOIN_PATH.
const COACHING_JOIN_PATH = /^\/coaching\/join\/[0-9A-Za-z-]{1,40}$/;
export const HOUSEHOLD_JOIN_PATH = /^\/household\/join\/[0-9A-Za-z-]{1,40}$/;

/** Each invite's join page and the signed-out phone page the middleware rewrites it to. */
const INVITE_PAGES = [
  { join: COACHING_JOIN_PATH, prefix: '/coaching/join/', signedOut: '/coaching-invite/' },
  { join: HOUSEHOLD_JOIN_PATH, prefix: '/household/join/', signedOut: '/household-invite/' },
] as const;

function invitePage(path: string) {
  return INVITE_PAGES.find((page) => page.join.test(path)) ?? null;
}

/** The path when it is an invite join page, else null. */
export function safeNextPath(raw: string | string[] | null | undefined): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === 'string' && invitePage(value) ? value : null;
}

/** `?next=<join path>` for the login / register links, or '' when there is none. */
export function nextQuery(next: string | null): string {
  return next ? `?next=${encodeURIComponent(next)}` : '';
}

/**
 * Where a signed-out visitor of `pathname` signs in. An invite link comes back
 * with `?next=` (only a valid join path is honoured by the login page); every
 * other page gets `?from=`, which reads as "your session expired".
 */
export function loginPathFor(pathname: string): string {
  // A prefix match: a malformed code still reads as an invite (the login page
  // then ignores the `next` it cannot honour) rather than "session expired".
  const isInvite = INVITE_PAGES.some((page) => pathname.startsWith(page.prefix));
  const key = isInvite ? 'next' : 'from';
  return `/login?${key}=${encodeURIComponent(pathname)}`;
}

/**
 * The app-or-web page a signed-out phone sees for an invite link
 * (`/coaching/join/X` → `/coaching-invite/X`), or null when `pathname` is not one.
 */
export function signedOutInvitePath(pathname: string): string | null {
  const page = invitePage(pathname);
  return page ? page.signedOut + pathname.slice(page.prefix.length) : null;
}
