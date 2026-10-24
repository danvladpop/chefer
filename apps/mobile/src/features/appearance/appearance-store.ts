import { useSyncExternalStore } from 'react';
import { colorScheme } from 'nativewind';
import { createExternalStore } from '../gym/offline/external-store';
import { kv } from '../gym/offline/kv';

// ─── Appearance: Automatic · Day · Night (mobile UX revamp, phase 4) ────────
// Night mode is the dark palette of @chefer/tokens (global.css's
// `prefers-color-scheme: dark` block). "Automatic" follows the phone's own
// light/dark setting; Day and Night pin one. It is a device setting, kept in
// the gym KV backend like the shell flags, so sign-out keeps it and a cold
// start applies it before the first frame.
//
// NativeWind's colorScheme.set() goes through React Native's
// Appearance.setColorScheme, so the keyboard, alerts, pickers and the share
// sheet follow the app too (this replaces UX-X-07's iOS "force light").

export type AppearanceMode = 'system' | 'light' | 'dark';

export const APPEARANCE_MODES: readonly AppearanceMode[] = ['system', 'light', 'dark'];

/** The words the setting shows for each mode. */
export const APPEARANCE_LABELS: Record<AppearanceMode, string> = {
  system: 'Automatic',
  light: 'Day',
  dark: 'Night',
};

const KEY = 'appearance.mode';

function isMode(value: string | null): value is AppearanceMode {
  return value === 'system' || value === 'light' || value === 'dark';
}

const store = createExternalStore<AppearanceMode>(() => {
  const saved = kv.getString(KEY);
  return isMode(saved) ? saved : 'system';
});

function apply(mode: AppearanceMode): void {
  try {
    colorScheme.set(mode);
  } catch {
    // An older native runtime without the override: the phone's setting stands.
  }
}

/**
 * At launch: re-apply a pinned Day or Night. Automatic needs nothing — with
 * no override the app already follows the phone, and leaving the native
 * appearance alone on Android avoids recreating the activity on every start.
 */
export function applyStoredAppearance(): void {
  const mode = store.get();
  if (mode !== 'system') apply(mode);
}

export function getAppearance(): AppearanceMode {
  return store.get();
}

/** The setting's choice: saved for this phone and applied at once. */
export function setAppearance(mode: AppearanceMode): void {
  if (store.get() === mode) return;
  kv.setString(KEY, mode);
  store.set(mode);
  apply(mode);
}

/** Reactive chosen mode (not the resolved scheme — see useColorScheme for that). */
export function useAppearance(): AppearanceMode {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

/** Tests: forget the cached value. */
export function resetAppearanceStoreForTests(): void {
  store.reset();
}
