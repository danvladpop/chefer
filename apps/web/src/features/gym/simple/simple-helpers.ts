import {
  LOGGED_WORKOUT_EXERCISE_IDS,
  WORKOUT_TYPE_GROUPS,
  type SessionExerciseDoc,
  type SessionSummaryDto,
  type WorkoutSessionDoc,
  type WorkoutTypeEntry,
  type WorkoutTypeGroup,
} from '@chefer/types';
import {
  estimateSessionKcal,
  sessionKcalCopy,
  simpleSkipKey,
  toSessionSummary,
  workoutMinutes,
  type SimpleWeek,
} from '@chefer/utils';
import type { KvStorage } from '../workout/storage';

// ─── "Keep it simple" on web: small pure helpers ─────────────────────────────
// Copy and derivations the simple Today, logger and summary share, kept out of
// the components so they are unit-tested. The domain logic itself
// (simpleToday, My week, the burn estimate) lives in @chefer/utils.

export interface WorkoutTypeSection {
  group: WorkoutTypeGroup;
  label: string;
  types: readonly WorkoutTypeEntry[];
}

/** The picker's chips under their group headings ("Strength", "Cardio"…), empty groups dropped. */
export function groupWorkoutTypes(options: readonly WorkoutTypeEntry[]): WorkoutTypeSection[] {
  return WORKOUT_TYPE_GROUPS.flatMap(({ group, label }) => {
    const types = options.filter((t) => t.group === group);
    return types.length > 0 ? [{ group, label, types }] : [];
  });
}

/** "45 min · ~280 kcal" — the week card's line; the kcal part only when there is one. */
export function simpleWeekLine(week: Pick<SimpleWeek, 'minutes' | 'kcal'>): string {
  return week.kcal === null ? `${week.minutes} min` : `${week.minutes} min · ~${week.kcal} kcal`;
}

/** "~240 kcal" (estimate) or "300 kcal" (the user's own number); null when nothing can be said. */
export function sessionKcalText(
  session: SessionSummaryDto,
  bodyweightKg: number | null,
): string | null {
  const burn = estimateSessionKcal({ session, bodyweightKg });
  return burn ? `${sessionKcalCopy(burn).value} kcal` : null;
}

/** "Done today · Yoga · 45 min · ~240 kcal". */
export function doneTodayLine(session: SessionSummaryDto, bodyweightKg: number | null): string {
  const parts = ['Done today', session.name, `${workoutMinutes(session)} min`];
  const kcal = sessionKcalText(session, bodyweightKg);
  if (kcal) parts.push(kcal);
  return parts.join(' · ');
}

/**
 * The live "~kcal so far": the in-progress doc billed as if it finished now.
 * Null without a body weight (the estimate needs one) or before a minute passed.
 */
export function liveWorkoutKcal(
  doc: WorkoutSessionDoc,
  nowIso: string,
  bodyweightKg: number | null,
): number | null {
  const burn = estimateSessionKcal({
    session: { ...toSessionSummary(doc), finishedAt: nowIso },
    bodyweightKg,
  });
  return burn?.isEstimate ? burn.kcal : null;
}

/** A simple-logger row's Done tick: every working set is ticked (and there is one). */
export function isExerciseTicked(se: Pick<SessionExerciseDoc, 'sets'>): boolean {
  const working = se.sets.filter((s) => !s.isWarmup);
  return working.length > 0 && working.every((s) => s.completedAt !== null);
}

/** The exercises a simple summary lists as done (a logged workout's duration entry is not one). */
export function tickedExercises(doc: WorkoutSessionDoc): SessionExerciseDoc[] {
  return [...doc.exercises]
    .sort((a, b) => a.position - b.position)
    .filter(
      (se) =>
        !se.skipped && !LOGGED_WORKOUT_EXERCISE_IDS.has(se.exerciseId) && isExerciseTicked(se),
    );
}

/** Skip on today's planned workout is remembered on this device, for that day only. */
export function readSimpleSkip(storage: KvStorage, localDate: string): boolean {
  try {
    return storage.getItem(simpleSkipKey(localDate)) === '1';
  } catch {
    return false;
  }
}

export function writeSimpleSkip(storage: KvStorage, localDate: string): void {
  try {
    storage.setItem(simpleSkipKey(localDate), '1');
  } catch {
    // Storage unavailable: the skip still applies until the page reloads.
  }
}

/** Where My week returns to after Save: `?from=settings` → Gym settings, else Today. */
export function myWeekReturnPath(search: string): string {
  return new URLSearchParams(search).get('from') === 'settings' ? '/gym/settings' : '/gym';
}

export const MY_WEEK_CONFLICT_MESSAGE =
  'Your week was changed somewhere else. We loaded the latest version — check it and save again.';

/**
 * What the My week screen says when Save fails, and whether it must re-fetch
 * first: a stale `expectedVersion` (CONFLICT) reloads the latest routine; any
 * other error (e.g. "A routine holds up to 7 days…") is shown as the server
 * worded it.
 */
export function myWeekSaveError(
  error: unknown,
  describe: (error: unknown) => string,
): { message: string; refetch: boolean } {
  const code =
    typeof error === 'object' && error !== null && 'data' in error
      ? (error as { data?: { code?: unknown } | null }).data?.code
      : undefined;
  if (code === 'CONFLICT') return { message: MY_WEEK_CONFLICT_MESSAGE, refetch: true };
  return { message: describe(error), refetch: false };
}
