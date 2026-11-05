import { requireOptionalNativeModule } from 'expo';

// The rest timer's native half (C1, needs the next store build): the local
// `chefer-rest-timer` Expo module (apps/mobile/modules/chefer-rest-timer) puts
// the countdown on the lock screen — a Live Activity + Dynamic Island on iOS,
// an ongoing countdown notification on Android, both with +30 s / Skip — and
// owns the on-time "Rest is over" alert (UX-GYM-10). OTA JS also runs on
// binaries built before the module existed, so it is feature-detected: without
// it, rest-timer.ts keeps scheduling the alert through expo-notifications.

export interface NativeRest {
  /** Epoch ms when the rest is over. */
  endsAt: number;
  durationSec: number;
  /** "Next: …" line on the lock screen; null shows a generic one. */
  label: string | null;
}

export interface NativeRestState {
  rest: NativeRest | null;
  /** Epoch ms of the last +30 s / Skip tapped on the lock screen. */
  lastActionAt: number | null;
}

interface Subscription {
  remove(): void;
}

export interface NativeRestTimer {
  /** Makes the lock-screen countdown and the alert match `rest` (null = none). */
  sync(rest: NativeRest | null): Promise<void>;
  getState(): NativeRestState;
  addListener(event: 'onChange', listener: (state: NativeRestState) => void): Subscription;
  /** Android 12+ only: "Alarms & reminders" is off, so long rests can ring late. */
  needsExactAlarmPermission?(): boolean;
  /** Android only: opens this app's "Alarms & reminders" switch. */
  openExactAlarmSettings?(): boolean;
}

let override: NativeRestTimer | null | undefined;

export function getNativeRestTimer(): NativeRestTimer | null {
  if (override !== undefined) return override;
  return requireOptionalNativeModule<NativeRestTimer>('CheferRestTimer');
}

/** Test seam: a fake module, `null` for an old binary, `undefined` to reset. */
export function setNativeRestTimerForTests(fake: NativeRestTimer | null | undefined): void {
  override = fake;
}
