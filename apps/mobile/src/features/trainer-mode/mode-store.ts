import { useSyncExternalStore } from 'react';
import type { AppShellMode } from '@chefer/types';
import { effectiveShellMode } from '@chefer/utils';
import { createExternalStore } from '../gym/offline/external-store';
import { kv } from '../gym/offline/kv';

// ─── Trainer mode: the remembered app shell (docs/prd-2026-10/trainer-mode.md §5.1) ───
// Two values in the device KV, read synchronously so a cold start picks its
// shell before the first frame (no flash of personal Today for a trainer):
//  - the last mode this device was in (`personal` | `trainer`). A device
//    setting: sign-out keeps it (DEVICE_KV_KEYS_KEPT), like the shell preview;
//  - the last known answer to "is trainer mode available to this account?"
//    (flag on AND trainer tools active). Account-owned: sign-out wipes it, so
//    the next account starts in personal mode until its own answer arrives.
// The live answer (use-trainer-mode.ts) keeps the cached one in step; a
// missing or failed answer changes nothing.

export const SHELL_MODE_KEY = 'shell.mode';
const AVAILABLE_KEY = 'trainerMode.available';

const modeStore = createExternalStore<AppShellMode>(() =>
  kv.getString(SHELL_MODE_KEY) === 'trainer' ? 'trainer' : 'personal',
);
const availableStore = createExternalStore<boolean>(() => kv.getString(AVAILABLE_KEY) === '1');

/** Synchronous: the mode this device was last in. */
export function getShellMode(): AppShellMode {
  return modeStore.get();
}

export function setShellMode(mode: AppShellMode): void {
  if (modeStore.get() === mode) return;
  kv.setString(SHELL_MODE_KEY, mode);
  modeStore.set(mode);
}

/** Synchronous: the cached "trainer mode is available" answer (false until one arrived). */
export function isTrainerModeAvailableCached(): boolean {
  return availableStore.get();
}

export function setTrainerModeAvailableCache(available: boolean): void {
  if (availableStore.get() === available) return;
  kv.setString(AVAILABLE_KEY, available ? '1' : '0');
  availableStore.set(available);
}

/** Synchronous: the shell a cold start opens — a remembered trainer mode only while (cached) available. */
export function landingShellModeSync(): AppShellMode {
  return effectiveShellMode(getShellMode(), isTrainerModeAvailableCached());
}

/** Reactive `getShellMode()`. */
export function useShellMode(): AppShellMode {
  return useSyncExternalStore(modeStore.subscribe, modeStore.get, modeStore.get);
}

/** Reactive `isTrainerModeAvailableCached()`. */
export function useTrainerModeAvailableCached(): boolean {
  return useSyncExternalStore(availableStore.subscribe, availableStore.get, availableStore.get);
}

/** Sign-out: forget the account's cached answer (the KV key itself is wiped by the scan). */
export function resetTrainerModeAvailableCache(): void {
  availableStore.reset();
}

/** Tests: forget both cached values (re-read from KV on next access). */
export function resetShellModeStoreForTests(): void {
  modeStore.reset();
  availableStore.reset();
}
