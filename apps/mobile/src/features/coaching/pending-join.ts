import { useSyncExternalStore } from 'react';
import { KV_KEYS } from '../gym/offline/keys';
import { kv } from '../gym/offline/kv';

// ─── Pending join (spec §2.3 steps 1 and 4) ───────────────────────────────────
// An invite code the client still has to finish: they were signed out (sign in or register first), or
// they have no gym setup yet (the existing setup runs first). The code stays on this device (never sent
// anywhere); the PendingJoinHost returns to the join screen after sign-in, and Gym Today offers
// "Carry on joining your trainer" after setup. Read straight from the KV store on every call so a
// sign-out wipe is never shadowed by a stale in-memory copy.

const JOIN_CODE = /^[0-9A-Za-z-]{1,40}$/;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function rememberPendingJoin(code: string): void {
  if (!JOIN_CODE.test(code)) return;
  kv.setString(KV_KEYS.coachingPendingJoin, code);
  emit();
}

export function readPendingJoin(): string | null {
  const code = kv.getString(KV_KEYS.coachingPendingJoin);
  return code !== null && JOIN_CODE.test(code) ? code : null;
}

export function clearPendingJoin(): void {
  if (kv.getString(KV_KEYS.coachingPendingJoin) === null) return;
  kv.remove(KV_KEYS.coachingPendingJoin);
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function usePendingJoin(): string | null {
  return useSyncExternalStore(subscribe, readPendingJoin);
}

/** The route of the join screen for an invite code. */
export function joinHref(code: string): `/coaching/join/${string}` {
  return `/coaching/join/${encodeURIComponent(code)}`;
}

// ─── "Sign in, then come back to the invite" (spec §2.3 step 1) ───────────────
// In memory only (a cold start in between falls back to Gym Today's "Carry on joining your trainer",
// which reads the persisted pending code). Separate from `readPendingJoin` because the gym-setup
// carry-on must NOT bounce the client back to the invite the moment they open /gym/setup.

let returnAfterSignIn: string | null = null;

export function setReturnAfterSignIn(code: string | null): void {
  returnAfterSignIn = code !== null && JOIN_CODE.test(code) ? code : null;
}

export function getReturnAfterSignIn(): string | null {
  return returnAfterSignIn;
}
