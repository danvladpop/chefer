// ─── Carry-over (T-36.3, CI-49) ────────────────────────────────────────────────
// `GymProfile.carryOver` and the session doc's `carryOverExerciseIds?` agree on
// the `CarryOverItem`/`CarryOverList` shape (`@chefer/types`). Pure list logic
// lives here; `session.ts` (`buildNextWorkout`) turns a `CarryOverList` into
// prepended `NextWorkoutExerciseDto`s so the same code path serves the API
// (`gym-bootstrap.service.ts`) and the client's offline optimistic fold
// (`applyFinishedSession`).
import type { CarryOverList, WorkoutSessionDoc } from '@chefer/types';

export type { CarryOverItem, CarryOverList } from '@chefer/types';

/** Never let a bug or a long stall grow this list without bound. */
export const CARRY_OVER_MAX = 20;

/** An exercise with zero logged sets (warm-up or working) — "not started". */
function isUnstarted(se: WorkoutSessionDoc['exercises'][number]): boolean {
  return !se.skipped && se.sets.every((s) => s.completedAt === null);
}

/** Every non-skipped, zero-logged-sets exercise of `doc`, in session order. */
export function unstartedExercises(
  doc: WorkoutSessionDoc,
): WorkoutSessionDoc['exercises'][number][] {
  return [...doc.exercises].sort((a, b) => a.position - b.position).filter(isUnstarted);
}

/**
 * `CarryOverItem[]` for a just-finished doc's `carryOverExerciseIds` (the
 * exercises the user — or the 24 h auto-finish — chose to move on). Freestyle
 * sessions (no `routineDayId`) never carry over (UX-36 edge case).
 */
export function carryOverItemsFrom(doc: WorkoutSessionDoc): CarryOverList {
  if (doc.status !== 'COMPLETED' || !doc.routineDayId) return [];
  const ids = doc.carryOverExerciseIds ?? [];
  if (ids.length === 0) return [];
  const routineDayId = doc.routineDayId;
  return ids.map((exerciseId) => ({ exerciseId, fromSessionId: doc.id, routineDayId }));
}

/**
 * Merge new carry-over items into the stored list: an exercise already on the
 * list moves to the front with its newer session/day (idempotent re-sends
 * don't duplicate it), capped at `CARRY_OVER_MAX` so a long stall can't grow
 * the profile row without bound.
 */
export function mergeCarryOver(existing: CarryOverList, incoming: CarryOverList): CarryOverList {
  if (incoming.length === 0) return existing;
  const incomingIds = new Set(incoming.map((i) => i.exerciseId));
  const kept = existing.filter((i) => !incomingIds.has(i.exerciseId));
  return [...incoming, ...kept].slice(0, CARRY_OVER_MAX);
}

/**
 * Once a carried-over exercise appears in a newly COMPLETED session (done or
 * skipped again — either way it was addressed), it's consumed: drop it from
 * the stored list so it doesn't carry forever.
 */
export function consumeCarryOver(existing: CarryOverList, doc: WorkoutSessionDoc): CarryOverList {
  if (doc.status !== 'COMPLETED' || existing.length === 0) return existing;
  const touched = new Set(doc.exercises.map((e) => e.exerciseId));
  return existing.filter((i) => !touched.has(i.exerciseId));
}

/**
 * The list to persist after a session write: consume anything this doc
 * addressed, then add whatever it newly carries over.
 */
export function nextCarryOver(existing: CarryOverList, doc: WorkoutSessionDoc): CarryOverList {
  return mergeCarryOver(consumeCarryOver(existing, doc), carryOverItemsFrom(doc));
}
