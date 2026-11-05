import type { Translator } from '@chefer/i18n';
import type {
  CoachedExerciseDto,
  CoachedSetDto,
  CoachedWorkoutDto,
  ExerciseMeta,
  NextTargetDto,
} from '@chefer/types';
import { formatLoad, formatLoadNumber, workoutTypeLabel } from '@chefer/utils';
import { getTranslator } from '../../lib/i18n';
import { formatDayWithWeekdayT } from '../coaching/copy';

type T = Translator['t'];

/** The UI language's `t` at call time (helpers called outside React). */
const current = (): T => getTranslator().t;

// Pure formatting for the trainer screens (spec §2.4, §2.5). Weights are shown in kg: the trainer's
// own unit preference is not part of what a client shares, and the engine stores kg.

/** "Maria Pop" → "Maria" (client-facing copy uses the first name). */
export function firstNameOf(name: string): string {
  const first = name.trim().split(/\s+/)[0];
  return first && first !== '' ? first : name;
}

/** "Tue 30 Sep" for a device-local `YYYY-MM-DD` date (same words as web), in the UI language. */
export function formatWeekdayDate(value: string, t: T = current()): string {
  return formatDayWithWeekdayT(value, t);
}

/** "Last set effort": reps in reserve, 3 meaning "3+". */
export function rirText(rir: number | null, t: T = current()): string | null {
  if (rir === null) return null;
  return rir >= 3
    ? t('coaching.trainer.workouts.rirPlus')
    : t('coaching.trainer.workouts.rir', { value: String(rir) });
}

/** One logged set as the trainer reads it: "60 kg × 8", "60 kg × 8 (warm-up)", "Not completed", cardio "20 min · 3.2 km". */
export function formatCoachedSet(set: CoachedSetDto, t: T = current()): string {
  if (set.durationSec !== undefined && set.durationSec > 0 && set.reps <= 0) {
    const minutes = Math.round((set.durationSec / 60) * 10) / 10;
    const distance =
      set.distanceM !== undefined && set.distanceM > 0
        ? ` · ${Math.round((set.distanceM / 1000) * 100) / 100} km`
        : '';
    return `${minutes} min${distance}`;
  }
  const base = `${formatLoadNumber(set.weightKg, 'KG')} kg × ${set.reps}`;
  if (!set.completed) return t('coaching.trainer.workouts.notCompleted', { set: base });
  return set.isWarmup ? t('coaching.trainer.workouts.warmup', { set: base }) : base;
}

/**
 * PRD 2026-10 §4.3: a "Keep it simple" exercise ticked done with the planned numbers never edited reads
 * "Done as planned · 3 sets" — its sets are the plan, never shown as lifted weights. Null otherwise.
 */
export function doneAsPlannedText(exercise: CoachedExerciseDto, t: T = current()): string | null {
  if (!exercise.doneAsPlanned) return null;
  const n = exercise.sets.length;
  return n > 0
    ? t('coaching.trainer.profile.doneAsPlannedSets', { count: n })
    : t('coaching.trainer.profile.doneAsPlanned');
}

/**
 * A typed workout with no exercises (a logged "Yoga" or a type-only day): "Yoga · 45 min", or "Yoga"
 * when the duration is unknown. Null for any other workout. Never calories (D-8).
 */
export function workoutTypeLine(
  workout: Pick<CoachedWorkoutDto, 'workoutType' | 'durationMin' | 'exercises'>,
  t: T = current(),
): string | null {
  if (!workout.workoutType || workout.exercises.length > 0) return null;
  // `workoutTypeLabel` (@chefer/utils) is still English: the workout types are not in a catalog yet.
  const label = workoutTypeLabel(workout.workoutType);
  return workout.durationMin !== null
    ? `${label} · ${t('common.counts.minutes', { count: workout.durationMin })}`
    : label;
}

/** "62.5 kg × 6, 6, 6, 6" — the weight once, then each set's reps. */
export function formatTargetValue(
  weightKg: number,
  reps: readonly number[],
  meta: ExerciseMeta | undefined,
): string {
  const load = formatLoad(weightKg, 'KG', meta?.loadType ?? 'WEIGHTED', {
    each: meta?.perHand ?? false,
  });
  return `${load} × ${reps.join(', ')}`;
}

/** What the engine (or the pending target) prescribes next, as one value string. */
export function nextTargetValueText(next: NextTargetDto, meta: ExerciseMeta | undefined): string {
  const source = next.override
    ? { weightKg: next.override.weightKg, reps: next.override.reps }
    : { weightKg: next.suggestion.weightKg, reps: next.suggestion.reps };
  return formatTargetValue(source.weightKg, source.reps, meta);
}

/** "6–8" or "8" for the rep range a next target is keyed to. */
export function repRangeText(repMin: number, repMax: number): string {
  return repMin === repMax ? `${repMin}` : `${repMin}–${repMax}`;
}
