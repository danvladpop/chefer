import { capture } from '@/lib/analytics';
import type { PrKind, ReasonCode, TrainingExperience } from '@chefer/types';

// ─── Gym analytics (gym_plan.md §6.6) ─────────────────────────────────────────
// A typed wrapper over the shared PostHog `capture` helper (apps/web/src/lib/
// analytics.ts) so every call site's event name and properties are checked by
// the compiler — a typo in an event name or a missing property is a build
// error, not a silently-empty PostHog insight. Documented in
// docs/analytics-funnel.md ("Gym").
//
// Mirrored by a same-shaped NO-OP stub at
// apps/mobile/src/features/gym/analytics.ts — mobile has no analytics SDK
// yet, so call sites exist for later without wiring one up now.

export interface GymEventMap {
  /** The Food | Gym mode switch (gym_plan.md D3). */
  gym_mode_switched: { to: 'food' | 'gym' };
  /** Setup wizard finished — a routine and initial progressions now exist. */
  gym_setup_completed: {
    template: string;
    days: number;
    experience: TrainingExperience;
    knownWeights: boolean;
  };
  /** A workout began, from Today's "next up", "do another day", or freestyle. */
  workout_started: { source: 'next' | 'picked' | 'freestyle' };
  /** The finish screen was reached. */
  workout_finished: {
    durationMin: number;
    sets: number;
    prs: number;
    /** Any in-session edit (swap, skip, add/remove set, reorder). */
    edited: boolean;
    /** True if the session was ever queued offline before syncing (web outbox). */
    offline?: boolean;
  };
  /** The user changed the engine's prefilled weight/reps before logging a set. */
  suggestion_overridden: { reasonCode: ReasonCode; direction: 'up' | 'down' | 'same' };
  /** A routine day, exercise or set configuration was saved from the editor. */
  routine_edited: { kind: string };
  /** A weight, rep-at-weight or e1RM personal record was set. */
  pr_achieved: { kind: PrKind };
  /** The weekly session goal was met (week ring completed). */
  week_goal_met: { streak: number };
  /** Training paused (vacation / illness / injury / other). */
  training_paused: { weeks: number; reason: string | null };
  /** An offline outbox entry could not be applied by the server (also sent to Sentry on the API). */
  sync_failed: { reason: string };
  /** The exercise technique video sheet was opened. */
  video_opened: { fallback: boolean };
}

/** Fires a gym PostHog event with compile-time-checked properties. */
export function captureGymEvent<E extends keyof GymEventMap>(
  event: E,
  properties: GymEventMap[E],
): void {
  capture(event, properties);
}
