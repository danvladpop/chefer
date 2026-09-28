import { ExerciseTrackingType } from '@chefer/types';

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
//   2  W2 L-GYM's OTA (D-20 b) or W5               — renders DURATION_DISTANCE, DISTANCE, cardio
//                                                     SessionSet fields and cardio equipment values;
//                                                     logs cardio as one entry
//   3  W5 L-GYMDATA's OTA                          — also renders INTERVALS, requested exercises
//                                                     and routine cardio slots
//
// This helper answers exactly one question — "which ExerciseTrackingType
// values may this level be sent" — so every gym read path applies the same
// rule (L-GYM's T-42.2 wires it into gym.bootstrap, gym.library.list,
// gym.session.get, gym.session.list; a routine returned to a level < 3
// client has its cardio slots removed the same way).

/**
 * Tracking types renderable at `level` (Δ2.1). Strength types and `DURATION`
 * are always included — a timed exercise (plank, carries) already renders on
 * every shipped client, since it predates this enum. `DURATION_DISTANCE` and
 * `DISTANCE` need level 2 (the cardio entry UI); `INTERVALS` needs level 3
 * (the interval timer, W5).
 */
export function renderableTrackingTypes(level: number): ExerciseTrackingType[] {
  const types: ExerciseTrackingType[] = [
    ExerciseTrackingType.WEIGHT_REPS,
    ExerciseTrackingType.BODYWEIGHT_REPS,
    ExerciseTrackingType.DURATION,
  ];
  if (level >= 2) {
    types.push(ExerciseTrackingType.DURATION_DISTANCE, ExerciseTrackingType.DISTANCE);
  }
  if (level >= 3) {
    types.push(ExerciseTrackingType.INTERVALS);
  }
  return types;
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
