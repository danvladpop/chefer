import * as Haptics from 'expo-haptics';

// Fire-and-forget haptics (gym_plan.md §5.3: on ✓, on timer zero, on a PR).
// The Taptic engine silently no-ops in Low Power Mode; a rejected promise
// must never surface in the workout.

export function hapticTick(): void {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
}

export function hapticPr(): void {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
}

export function hapticRestDone(): void {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
}
