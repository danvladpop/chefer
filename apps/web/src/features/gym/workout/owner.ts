import { createExternalStore } from './external-store';
import { getStorage, GYM_KEYS } from './storage';

// The user id that owns this browser's gym data (the outbox and the active
// session). Mirrors apps/mobile/src/features/gym/offline/owner.ts:
//  • the LAST KNOWN owner — persisted, used to stamp new entries and to spot
//    an account switch on a shared computer;
//  • the CONFIRMED owner — auth.me answered in THIS page load. Only the
//    confirmed owner may upload: one account's workouts must never be sent
//    with another account's session cookie.

const ownerStore = createExternalStore<string | null>(() => getStorage().getItem(GYM_KEYS.owner));
let confirmed = false;

export function getGymOwner(): string | null {
  return ownerStore.get();
}

export function getConfirmedGymOwner(): string | null {
  return confirmed ? ownerStore.get() : null;
}

/** Records the server-confirmed user; `changed` when a different user owned the data before. */
export function setGymOwner(userId: string): { previous: string | null; changed: boolean } {
  const previous = ownerStore.get();
  confirmed = true;
  if (previous === userId) {
    return { previous, changed: false };
  }
  getStorage().setItem(GYM_KEYS.owner, userId);
  ownerStore.set(userId);
  return { previous, changed: previous !== null };
}

/** Signed out (or the session changed): uploads wait for a fresh confirmation. */
export function invalidateGymOwnerConfirmation(): void {
  confirmed = false;
}

export const subscribeGymOwner = ownerStore.subscribe;

/** Test seam. */
export function resetGymOwnerForTests(): void {
  confirmed = false;
  ownerStore.reset();
}
