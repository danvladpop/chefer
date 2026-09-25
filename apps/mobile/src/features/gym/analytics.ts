import type { PrKind, ReasonCode, TrainingExperience } from '@chefer/types';

// ─── Gym analytics — mobile no-op (gym_plan.md §6.6) ─────────────────────────
// Mobile has no analytics SDK yet, so this deliberately does NOT wire one up.
// It exists so every call site in the app compiles today with the same typed
// shape as the web wrapper (apps/web/src/features/gym/analytics.ts) — when a
// mobile SDK lands, only this file changes; every call site stays the same.
//
// Kept in step with the web GymEventMap by hand (mobile and web can't share a
// runtime import here without adding a cross-app dependency, and the shared
// package boundary is types/utils only per CLAUDE.md).

export interface GymEventMap {
  gym_mode_switched: { to: 'food' | 'gym' };
  gym_setup_completed: {
    template: string;
    days: number;
    experience: TrainingExperience;
    knownWeights: boolean;
  };
  workout_started: { source: 'next' | 'picked' | 'freestyle' };
  workout_finished: {
    durationMin: number;
    sets: number;
    prs: number;
    edited: boolean;
    offline?: boolean;
  };
  suggestion_overridden: { reasonCode: ReasonCode; direction: 'up' | 'down' | 'same' };
  routine_edited: { kind: string };
  pr_achieved: { kind: PrKind };
  week_goal_met: { streak: number };
  training_paused: { weeks: number; reason: string | null };
  sync_failed: { reason: string };
  video_opened: { fallback: boolean };
}

/**
 * No-op today (logs in __DEV__ only, for the call sites to be smoke-tested by
 * eye during development). Fires nothing in production and never throws.
 */
export function captureGymEvent<E extends keyof GymEventMap>(
  event: E,
  properties: GymEventMap[E],
): void {
  if (__DEV__) {
    console.warn(`[gym analytics stub] ${event}`, properties);
  }
}
