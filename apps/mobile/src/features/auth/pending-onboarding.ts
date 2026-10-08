import { useSyncExternalStore } from 'react';

// R-18b: "a brand-new account goes through onboarding" as STATE, not as an
// imperative `router.replace('/onboarding')` fired after the token write.
//
// Registration used to flip the auth guard (setToken -> notify) and only THEN,
// after two awaited SecureStore writes, call `router.replace('/onboarding')`.
// By that time the root Stack had already swapped (auth) for the protected
// group and mounted Today, so on a slow first Keychain write (a fresh install:
// the token write plus the first-ever `hasSignedInBefore` write) the replace
// raced the navigator and the new account stayed on Today. Registration now
// raises this flag BEFORE the token is stored; the Food tab layout — the first
// protected screen the guard flip mounts — renders a <Redirect> to
// /onboarding while it is up, and the onboarding screen clears it on arrival.
// In-memory only: a cold start never replays onboarding.

let pending = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** Called by registration, before the session token is stored. */
export function requestOnboarding(): void {
  if (pending) return;
  pending = true;
  emit();
}

/** Called by the onboarding screen once it is on screen (and on sign-out). */
export function clearPendingOnboarding(): void {
  if (!pending) return;
  pending = false;
  emit();
}

export function isOnboardingPending(): boolean {
  return pending;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePendingOnboarding(): boolean {
  return useSyncExternalStore(subscribe, isOnboardingPending);
}
