import type { PrKind, ReasonCode, TrainingExperience } from '@chefer/types';
import { track } from '../../lib/analytics';

// ─── Gym analytics — mobile (T-12.2, gym_plan.md §6.6) ───────────────────────
// T-12.2: `captureGymEvent` is now a real re-export over the shared JS
// transport (`lib/analytics.ts`) instead of a `__DEV__`-only no-op — every
// call site is unchanged. Still its own `GymEventMap`, kept in step with the
// web version (`apps/web/src/features/gym/analytics.ts`) by hand: mobile and
// web can't share a runtime import here without a cross-app dependency, and
// the shared package boundary is types/utils only per CLAUDE.md. It is a
// separate namespace from the shared `EventMap` (`@chefer/types`) — some of
// its property types (`kind: string`, `reason: string | null`) predate and
// would fail the health-data guard as literally typed; unifying it with
// `EventMap` is a good follow-up but not this task's to make alone (the web
// counterpart has the same shape and isn't owned by this lane).

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

/** Re-exports through the shared JS transport — respects the same consent switches. */
export function captureGymEvent<E extends keyof GymEventMap>(
  event: E,
  properties: GymEventMap[E],
): void {
  track(event, properties);
}
