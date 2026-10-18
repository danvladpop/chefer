import { useEffect } from 'react';
import { Dimensions, useWindowDimensions } from 'react-native';
import type * as ScreenOrientationModule from 'expo-screen-orientation';

// ─── Phone-only portrait lock ────────────────────────────────────────────────
// The native config no longer restricts orientation (`orientation: 'default'`
// in app.config.js): Play warns that Android 16 ignores orientation and
// resizability restrictions on large screens (smallest width ≥ 600dp), and
// tablets already rotate there. Phones stay portrait — the app's layouts are
// built for it — through a runtime lock that follows the WINDOW, so a foldable
// that unfolds or a freeform window resized across the threshold re-evaluates.
//
// iOS: the app is iPhone-only and its Info.plist stays portrait
// (app.config.js `ios.infoPlist`), so iPhones never rotate, even at launch;
// this lock is belt and braces there. Android has no native per-size
// equivalent, so a phone held sideways at launch can show the splash in
// landscape for a moment until this lock applies.

/**
 * Android's large-screen boundary (`sw600dp`, the threshold Android 16 uses to
 * ignore orientation locks). Measured on the window's SMALLER side, so it does
 * not flip when the device rotates.
 */
export const LARGE_SCREEN_MIN_SIDE_DP = 600;

/** Pure: should this window be locked to portrait? */
export function shouldLockPortrait(window: { width: number; height: number }): boolean {
  return Math.min(window.width, window.height) < LARGE_SCREEN_MIN_SIDE_DP;
}

type ScreenOrientation = typeof ScreenOrientationModule;

let loaded: ScreenOrientation | null | undefined;

/**
 * expo-screen-orientation is a native module (1.0.2 binaries on). Loaded
 * lazily inside try/catch, like the sign-in modules (features/auth/social/
 * native-modules.ts): on a binary without it, importing throws — then there
 * is simply no lock, never a crash.
 */
function loadScreenOrientation(): ScreenOrientation | null {
  if (loaded !== undefined) return loaded;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- guarded optional native module
    loaded = require('expo-screen-orientation') as ScreenOrientation;
  } catch {
    loaded = null;
  }
  return loaded;
}

let applied: boolean | null = null;

/** Locks (phone) or unlocks (large screen); a no-op when nothing changed. Never rejects. */
export async function applyOrientationLock(lockPortrait: boolean): Promise<void> {
  if (applied === lockPortrait) return;
  const mod = loadScreenOrientation();
  if (!mod) return;
  applied = lockPortrait;
  try {
    if (lockPortrait) await mod.lockAsync(mod.OrientationLock.PORTRAIT_UP);
    else await mod.unlockAsync();
  } catch {
    // Unsupported on this device/OS: leave the platform default in place.
    applied = null;
  }
}

/** One-shot from the window at module load — as early as JS can act. */
export function applyInitialOrientationLock(): void {
  void applyOrientationLock(shouldLockPortrait(Dimensions.get('window')));
}

/** Keeps the lock in step with the window (foldables, freeform/desktop resizing). */
export function useOrientationLock(): void {
  const window = useWindowDimensions();
  const lockPortrait = shouldLockPortrait(window);
  useEffect(() => {
    void applyOrientationLock(lockPortrait);
  }, [lockPortrait]);
}

/** Tests only. */
export function resetOrientationLockForTests(): void {
  loaded = undefined;
  applied = null;
}
