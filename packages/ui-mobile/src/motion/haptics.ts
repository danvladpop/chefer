import * as Haptics from 'expo-haptics';
import type { HapticName } from '@chefer/tokens';

// The app's haptic vocabulary (motion-system.md §2.2 `haptic`), fire-and-forget.
// The Taptic engine silently no-ops in Low Power Mode and some Android devices
// have no vibrator: a rejected (or missing) promise must never surface in UI.
// Haptics are NOT motion — they stay on under Reduce Motion.

function fire(run: () => Promise<void>): void {
  try {
    run().catch(() => undefined);
  } catch {
    // No haptics engine (tests, web) — nothing to do.
  }
}

export const haptics: Record<HapticName, () => void> = {
  /** Chip, segmented control, stepper ±, day pill. */
  selection: () => fire(() => Haptics.selectionAsync()),
  /** Check-off, set ✓, heart. */
  tick: () => fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** Drag start (reorder). */
  lift: () => fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  /** Tier-2/3 success: log saved, workout finished, PR. */
  success: () => fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  /** Rest / cook timer reached zero. */
  warning: () => fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  /** Optimistic rollback. */
  error: () => fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};
