import { useEffect, useSyncExternalStore } from 'react';
import { createExternalStore } from '../gym/offline/external-store';
import { kv } from '../gym/offline/kv';

// ─── Shell v2 switch (mobile UX revamp, phase 1) ────────────────────────────
// Which app shell renders: the current Food|Gym tab groups, or the revamp's
// one tab bar (Today · Plan · Shop · Train · You — `app/(main)`). Two inputs:
//  - the server flag `mobileShellV2` (profile.flags), cached here so a cold
//    start decides synchronously, with no flash of the old shell;
//  - a per-device preview opt-in, offered to admins and dev builds in
//    Settings, so the owner can live in the new shell before the flag flips.
// Either one turns the new shell on. Both live in the gym KV backend, like
// the landing cache; sign-out keeps them (they are device settings).

const FLAG_KEY = 'shell.v2.flag';
const OPT_IN_KEY = 'shell.v2.preview';

const flagStore = createExternalStore<boolean>(() => kv.getString(FLAG_KEY) === '1');
const optInStore = createExternalStore<boolean>(() => kv.getString(OPT_IN_KEY) === '1');

/** Synchronous: is the revamp shell on for this device right now? */
export function isShellV2(): boolean {
  return flagStore.get() || optInStore.get();
}

/** The cached server flag (true once a `profile.flags` response said so). */
export function setShellV2Flag(on: boolean): void {
  if (flagStore.get() === on) return;
  kv.setString(FLAG_KEY, on ? '1' : '0');
  flagStore.set(on);
}

export function isShellV2PreviewOn(): boolean {
  return optInStore.get();
}

/** The Settings preview switch. */
export function setShellV2Preview(on: boolean): void {
  kv.setString(OPT_IN_KEY, on ? '1' : '0');
  optInStore.set(on);
}

function subscribe(listener: () => void): () => void {
  const a = flagStore.subscribe(listener);
  const b = optInStore.subscribe(listener);
  return () => {
    a();
    b();
  };
}

/** Reactive `isShellV2()`. */
export function useShellV2(): boolean {
  return useSyncExternalStore(subscribe, isShellV2, isShellV2);
}

/** Reactive preview opt-in (the Settings switch's value). */
export function useShellV2Preview(): boolean {
  return useSyncExternalStore(optInStore.subscribe, optInStore.get, optInStore.get);
}

/**
 * Keeps the cached flag in step with the live `profile.flags` answer. A
 * missing answer (older API, offline) changes nothing: the last known value
 * stands, and a never-seen flag reads as off.
 */
export function useSyncShellV2Flag(flagOn: boolean | undefined): void {
  useEffect(() => {
    if (flagOn !== undefined) setShellV2Flag(flagOn);
  }, [flagOn]);
}

/** Tests: forget the cached values. */
export function resetShellStoreForTests(): void {
  flagStore.reset();
  optInStore.reset();
}
