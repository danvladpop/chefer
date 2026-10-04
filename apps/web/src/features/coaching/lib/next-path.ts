// "Sign in, then come back to the invite" (spec §2.3). Only the coaching join
// page may be returned to, so `?next=` can never become an open redirect.

const JOIN_PATH = /^\/coaching\/join\/[0-9A-Za-z-]{1,40}$/;

/** The path when it is a coaching join page, else null. */
export function safeNextPath(raw: string | string[] | null | undefined): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === 'string' && JOIN_PATH.test(value) ? value : null;
}

/** `?next=<join path>` for the login / register links, or '' when there is none. */
export function nextQuery(next: string | null): string {
  return next ? `?next=${encodeURIComponent(next)}` : '';
}
