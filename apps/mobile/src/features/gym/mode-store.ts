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
  if (modeStore.get() === mode) return;
  kv.setString(KV_KEYS.mode, mode);
  modeStore.set(mode);
}

export const subscribeMode = modeStore.subscribe;

export function useMode(): AppMode {
  return useSyncExternalStore(modeStore.subscribe, modeStore.get);
}

/** Test seam: forget the cached value so the next read hits the KV store. */
export function resetModeForTests(): void {
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
