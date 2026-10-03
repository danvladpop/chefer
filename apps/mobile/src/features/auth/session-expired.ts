// UX-ACC-10: an expired session used to bounce the user to sign-in without a
// word, and the three request paths disagreed about it — tRPC signed out
// quietly, chat showed the server's "Unauthorized", photo upload/scan said
// "Sign in again to add photos". Now they share one path:
//
//   any 401 → `reportUnauthorized()` → the handler the root layout registered
//   (mark the session expired, then the full `signOut`) → the sign-in screen
//   explains why it is there.
//
// A module-level flag rather than navigation params: the sign-out itself is
// what flips the auth gate, so there is no navigation to attach a param to.

export const SESSION_EXPIRED_MESSAGE = 'Your session expired. Sign in again.';
export const SESSION_EXPIRED_NOTICE =
  'Your session expired, so we signed you out. Sign in to pick up where you left off.';

let expired = false;
let handler: (() => void) | null = null;
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((listener) => listener());

/** True until the next successful sign-in (or until cleared). */
export function isSessionExpired(): boolean {
  return expired;
}

export function markSessionExpired(): void {
  expired = true;
  notify();
}

export function clearSessionExpired(): void {
  if (!expired) return;
  expired = false;
  notify();
}

/** useSyncExternalStore subscription. */
export function subscribeSessionExpired(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The root layout registers what a 401 does (mark + full sign-out). */
export function setUnauthorizedHandler(next: (() => void) | null): void {
  handler = next;
}

/**
 * For request paths that bypass tRPC (chat stream, photo upload/scan): call on
 * a 401 so they end the session exactly like a tRPC call would. Kept free of
 * platform imports (the contract tests load chat-stream/media-client under
 * Node); the registered handler decides whether anyone is signed in at all.
 */
export function reportUnauthorized(): void {
  handler?.();
}
