import { useSyncExternalStore } from 'react';
import { createExternalStore } from '../../gym/offline/external-store';
import { kv } from '../../gym/offline/kv';

// ─── Push on this device (docs/prd-2026-10/trainer-mode.md §7.2, M4) ──────────
// What the app remembers about remote push, in the device KV. All of it is
// account-owned (sign-out's KV scan wipes it; `resetPushStoreForSignOut` drops
// the in-memory copies):
//  - the Expo push token last registered with the API for this account — read
//    by sign-out to unregister it, and never sent anywhere else or logged;
//  - "push is active": the last registration succeeded and the OS permission
//    is on. While it is, the server sends the booking reminders, so the LOCAL
//    ones (§7.3) are cancelled and not scheduled — nothing fires twice. A
//    binary without the push entitlement / FCM (1.0.2 in the stores) never
//    gets a token, so it stays on local reminders.

const TOKEN_KEY = 'notifications.push.token';
const ACTIVE_KEY = 'notifications.push.active';

const activeStore = createExternalStore<boolean>(() => kv.getString(ACTIVE_KEY) === '1');

export function getRegisteredPushToken(): string | null {
  return kv.getString(TOKEN_KEY);
}

/** Records a successful registration: push is now the reminder channel on this device. */
export function markPushRegistered(token: string): void {
  kv.setString(TOKEN_KEY, token);
  setPushActive(true);
}

/** Push stopped working here (no permission, no token, server refused): back to local reminders. */
export function markPushInactive(): void {
  setPushActive(false);
}

function setPushActive(active: boolean): void {
  if (activeStore.get() === active) return;
  kv.setString(ACTIVE_KEY, active ? '1' : '0');
  activeStore.set(active);
}

/** Synchronous: whether the server delivers this device's notifications (reminders included). */
export function isPushActive(): boolean {
  return activeStore.get();
}

/** Reactive `isPushActive()`. */
export function usePushActive(): boolean {
  return useSyncExternalStore(activeStore.subscribe, activeStore.get, activeStore.get);
}

// ─── "Register now" requests (after a permission grant) ───────────────────────

let requestTick = 0;
const requestListeners = new Set<() => void>();

/** Asks the mounted PushRegistrationHost to (re-)register now, e.g. right after a grant. */
export function requestPushRegistration(): void {
  requestTick += 1;
  requestListeners.forEach((l) => l());
}

export function getPushRegistrationRequestTick(): number {
  return requestTick;
}

export function subscribePushRegistrationRequests(listener: () => void): () => void {
  requestListeners.add(listener);
  return () => {
    requestListeners.delete(listener);
  };
}

/** Sign-out / tests: forget the in-memory copies (the KV keys are wiped by the scan). */
export function resetPushStoreForSignOut(): void {
  activeStore.reset();
}
