import { ExerciseTrackingType } from '@chefer/types';
import { isFlagEnabled } from '../../lib/flags.js';

// ─── Gym client API levels (Δ2.1, T-42.0) ─────────────────────────────────────
// `ctx.clientApiLevel` (apps/api/src/lib/trpc.ts, parsed by
// apps/api/src/lib/session-auth.ts `clientApiLevel()` from the
// `x-chefer-api-level` header) already exists since W0; this module gives it
// two more meanings for the gym domain. A level is only ever sent by a
// bundle that implements it — the header is absent/unparseable on an
// installed binary from before that OTA, which parses as level 0.
//
//   0  installed binaries before W0's OTA         — knows nothing below
//   1  W0+                                         — handles the health-consent error (§2.8)
//   2  wave-1 OTA (T-39.1/T-26.5, already shipped, — sign-up consent checkboxes; the App Store
//      incl. App Store build 1.0.0 (5))              build 1.0.0 (5) sends this and must NEVER
//                                                     see cardio (orchestrator decision 2026-09-28,
//                                                     after wiring T-42.2 found level 2 already
//                                                     live — see the note below)
//   3  W2 L-GYM's OTA (D-20 b) or W5               — renders DURATION_DISTANCE, DISTANCE, cardio
//                                                     SessionSet fields and cardio equipment values;
//                                                     logs cardio as one entry
//   4  W3 OTA (L-CONSENT, T-26.3)                  — shows the health-consent sheet (not gym)
//   5  W5 L-GYMDATA's OTA                          — also renders INTERVALS, requested exercises
//                                                     and routine cardio slots
//
// Why cardio is level 3, not 2: `x-chefer-api-level` is a single shared
// counter across every feature (§2.8), and wave 1's unrelated consent-
// checkbox fix already claimed level 2 for every bundle built since —
// including the live App Store build. Gating cardio at "level >= 2" would
// have shipped it to that installed build's already-live 2, which has no
// cardio UI. Cardio (and INTERVALS after it) each take the NEXT unclaimed
// level instead, so "a level is only ever sent by a bundle that implements
// it" (§2.8) stays true for the gym domain specifically.
//
// This helper answers exactly one question — "which ExerciseTrackingType
// values may this level be sent" — so every gym read path applies the same
// rule (L-GYM's T-42.2 wires it into gym.bootstrap, gym.library.list,
// gym.session.get, gym.session.list; a routine returned to a level < 5
// client has its cardio slots removed the same way, W5).

/**
 * Tracking types renderable at `level` (Δ2.1, revised 2026-09-28 — cardio
 * moved from level 2 to level 3, INTERVALS from 3 to 4, then to 5 on 2026-09-29
 * because wave 3's health consent claimed 4; see the note above).
 * Strength types and `DURATION` are always included — a timed exercise
 * (plank, carries) already renders on every shipped client, since it
 * predates this enum. `DURATION_DISTANCE` and `DISTANCE` need level 3 (the
 * cardio entry UI, T-42.3); `INTERVALS` needs level 5 (the interval timer, W5).
 */
export function renderableTrackingTypes(level: number): ExerciseTrackingType[] {
  const types: ExerciseTrackingType[] = [
    ExerciseTrackingType.WEIGHT_REPS,
    ExerciseTrackingType.BODYWEIGHT_REPS,
    ExerciseTrackingType.DURATION,
  ];
  if (level >= 3) {
    types.push(ExerciseTrackingType.DURATION_DISTANCE, ExerciseTrackingType.DISTANCE);
  }
  if (level >= 5) {
    types.push(ExerciseTrackingType.INTERVALS);
  }
  return types;
}

/**
 * The level actually used for gating (2026-09-28 follow-up): `cardioLogging`
 * is a server flag (default OFF, Q-24) independent of what a bundle sends —
 * a mobile build that ships level 3 (T-42.3) must still see zero cardio rows
 * until the owner flips the flag on. Every router passes `ctx.clientApiLevel`
 * through this before it reaches a gym service, so `renderableTrackingTypes`
 * itself never needs to know about flags. Off ⇒ capped at 2 (no
 * DURATION_DISTANCE/DISTANCE/INTERVALS regardless of what the client
 * claims); on ⇒ the client's own level, unchanged.
 */
export function effectiveLevel(level: number): number {
  return isFlagEnabled('cardioLogging') ? level : Math.min(level, 2);
}

/** Whether `trackingType` may be sent to a client at `level` (Δ2.1). */
export function isTrackingTypeRenderable(
  trackingType: ExerciseTrackingType,
  level: number,
): boolean {
  return renderableTrackingTypes(level).includes(trackingType);
}

// ─── T-42.2: the four read paths (gym.bootstrap library/recentSessions,
// gym.library.list, gym.session.get, gym.session.list) share these two
// filters so the rule is applied identically everywhere. ────────────────────

/**
 * Drops library/exercise rows of a non-renderable type for `level`. Missing
 * `trackingType` (a shape that predates this field) defaults to WEIGHT_REPS,
 * which is renderable at every level.
 */
export function filterExerciseDtosForLevel<T extends { trackingType?: ExerciseTrackingType }>(
  rows: readonly T[],
  level: number,
): T[] {
  return rows.filter((r) =>
    isTrackingTypeRenderable(r.trackingType ?? ExerciseTrackingType.WEIGHT_REPS, level),
  );
}

/**
 * Drops session exercises whose exercise is a non-renderable type for
 * `level` — the session itself is never dropped, so week counts and streaks
 * are unaffected (Δ2.1). An exercise id missing from `trackingTypeById`
 * (shouldn't happen — session exercises only ever reference curated/owned
 * rows) defaults to WEIGHT_REPS and is kept.
 */
export function filterSessionExercisesForLevel<T extends { exerciseId: string }>(
  exercises: readonly T[],
  trackingTypeById: ReadonlyMap<string, ExerciseTrackingType>,
  level: number,
): T[] {
  return exercises.filter((e) =>
    isTrackingTypeRenderable(
      trackingTypeById.get(e.exerciseId) ?? ExerciseTrackingType.WEIGHT_REPS,
      level,
    ),
  );
}
