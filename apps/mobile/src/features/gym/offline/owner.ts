import { createExternalStore } from './external-store';
import { KV_KEYS } from './keys';
import { kv } from './kv';

// The user id that owns the on-device gym data (outbox entries, the active
// session, the persisted query cache).
//
// Two notions:
//  • the LAST KNOWN owner — persisted, so it is available on an offline cold
//    start; used to stamp new outbox entries and to detect account switches;
//  • the CONFIRMED owner — the server has told THIS process, for the CURRENT
//    session token, who we are. Only the confirmed owner may upload: right
//    after account B signs in, the persisted owner still says A until
//    auth.me answers, and A's workouts must never be sent with B's token.

const ownerStore = createExternalStore<string | null>(() => kv.getString(KV_KEYS.owner));
let confirmed = false;

/** Last known signed-in user id (null on a fresh install). */
export function getGymOwner(): string | null {
  return ownerStore.get();
}

/** The owner as confirmed for the current session token, else null. */
export function getConfirmedGymOwner(): string | null {
  return confirmed ? ownerStore.get() : null;
}

/**
 * Records the server-confirmed user for the current token. `changed` is true
 * when a DIFFERENT known user owned the device data before (clear their
 * cached reads).
 */
export function setGymOwner(userId: string): { previous: string | null; changed: boolean } {
  const previous = ownerStore.get();
  confirmed = true;
  if (previous === userId) {
    return { previous, changed: false };
  }
  kv.setString(KV_KEYS.owner, userId);
  ownerStore.set(userId);
  return { previous, changed: previous !== null };
}

/** The session token changed (sign-in/out): uploads wait for a fresh confirmation. */
export function invalidateGymOwnerConfirmation(): void {
  confirmed = false;
}

export const subscribeGymOwner = ownerStore.subscribe;

/** Test seam. */
export function resetGymOwnerForTests(): void {
  confirmed = false;
  ownerStore.reset();
}
