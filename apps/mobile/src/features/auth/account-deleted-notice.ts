// UX-ACC-11: after "Delete my account" the user used to drop onto "Welcome
// back" without a word, so a successful deletion looked like a crash. The
// profile card marks the deletion right before signing out; the sign-in screen
// shows one confirmation and clears it the moment it is left (or the user signs
// in again), so it is seen once.
//
// Module-level flag, like `session-expired.ts`: the sign-out itself flips the
// auth gate, so there is no navigation to attach a param to.

export const ACCOUNT_DELETED_NOTICE = 'Your account and data have been deleted.';

let deleted = false;
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((listener) => listener());

export function isAccountDeletedNoticeVisible(): boolean {
  return deleted;
}

export function markAccountDeleted(): void {
  deleted = true;
  notify();
}

export function clearAccountDeletedNotice(): void {
  if (!deleted) return;
  deleted = false;
  notify();
}

/** useSyncExternalStore subscription. */
export function subscribeAccountDeletedNotice(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
