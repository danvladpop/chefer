import { useSyncExternalStore } from 'react';
import { createExternalStore } from './offline/external-store';
import { KV_KEYS } from './offline/keys';
import { kv } from './offline/kv';

// Food / Gym app mode (gym_plan.md D3, §5.1). Persisted in the gym KV store
// and read synchronously, so the very first frame after launch already knows
// which tab group to show (no async load, no flash of the wrong mode).

export type AppMode = 'food' | 'gym';

const isMode = (value: unknown): value is AppMode => value === 'food' || value === 'gym';

const modeStore = createExternalStore<AppMode>(() => {
  const stored = kv.getString(KV_KEYS.mode);
  return isMode(stored) ? stored : 'food';
});

/** The persisted mode ('food' until the user first switches). */
export function getMode(): AppMode {
  return modeStore.get();
}

export function setMode(mode: AppMode): void {
  // Any explicit choice supersedes a Gym switch that was waiting for setup.
  pendingGymSwitch = false;
  // Written even when unchanged: the KV entry also records THAT the user has
  // chosen (`hasChosenMode`) — 'food' is the default, so tapping Food on a
  // jobs-based Gym landing must still persist (owner dogfood 2026-09-30).
  if (modeStore.get() === mode && kv.getString(KV_KEYS.mode) === mode) return;
  kv.setString(KV_KEYS.mode, mode);
  modeStore.set(mode);
}

// ── Mode follows setup (UX-X-11) ──────────────────────────────────────────────
// A food-only user who taps Gym just to look lands on "Set up your training";
// persisting that peek reopened Gym on every cold start. The switch only
// PERSISTS once Gym is actually set up: until then the previous choice (or
// "never chose", which lands by jobs) is restored, and the intent is kept in
// memory so the choice is recorded the moment setup completes.

let pendingGymSwitch = false;

/** Puts the persisted choice back to `previous` (null = the user had never chosen). */
export function restoreMode(previous: AppMode | null): void {
  if (previous === null) {
    kv.remove(KV_KEYS.mode);
    modeStore.reset();
    return;
  }
  kv.setString(KV_KEYS.mode, previous);
  modeStore.set(previous);
}

/** The user asked for Gym but it is not set up: remember it, persist once setup completes. */
export function deferGymMode(): void {
  pendingGymSwitch = true;
}

/** Call whenever the gym profile's existence is known: records the deferred Gym choice once it exists. */
export function commitPendingGymMode(hasGymProfile: boolean): void {
  if (!pendingGymSwitch || !hasGymProfile) return;
  setMode('gym'); // clears the pending flag
}

/** Test seam. */
export function hasPendingGymMode(): boolean {
  return pendingGymSwitch;
}

/** Whether the user (or a flow they started) has ever picked a mode on this device. */
export function hasChosenMode(): boolean {
  return isMode(kv.getString(KV_KEYS.mode));
}

export const subscribeMode = modeStore.subscribe;

export function useMode(): AppMode {
  return useSyncExternalStore(modeStore.subscribe, modeStore.get);
}

/** Test seam: forget the cached value so the next read hits the KV store. */
export function resetModeForTests(): void {
  pendingGymSwitch = false;
  modeStore.reset();
}

// ── Launch routing ────────────────────────────────────────────────────────────
// Both tab groups resolve at the root and a plain launch (or sign-in) opens
// "/" — the food dashboard. "/" means "home", and home in Gym mode is Today,
// so the (food) layout redirects when it mounts at "/" in Gym mode. Deep links
// to other food routes still open normally in either mode. Switching to Food
// sets the mode BEFORE navigating to "/", so it never bounces back.

/** Whether the (food) group, mounting at `pathname`, should open Gym Today instead. */
export function shouldOpenGymHome(pathname: string): boolean {
  return pathname === '/' && getMode() === 'gym';
}
