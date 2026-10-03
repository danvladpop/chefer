import type {
  GymBootstrap,
  NextWorkoutDto,
  NextWorkoutExerciseDto,
  StreakInfo,
  WeightUnit,
} from '@chefer/types';
import {
  addDaysLocal,
  buildNextWorkout,
  equipmentProfileOf,
  formatLoad,
  pickOffer,
  progressionKey,
  streakWeeksLabel,
  weekStartOf,
  type ProgressionEntry,
} from '@chefer/utils';
import { localDate } from '../offline/ids';
import { libraryLookup } from '../use-gym-bootstrap';

// Pure helpers for the Today tab (gym_plan.md §1.3 "Today tab", §1.4 habit
// mechanics) — kept dependency-free of React so they're trivial to unit test.
// `pickOffer` itself now lives in `@chefer/utils` (shared with web — G4-A
// found the two platforms disagreeing on offer priority) and is re-exported
// here so every existing caller of `./today-helpers` keeps working.
export { pickOffer };

export type DayStatus = 'done' | 'planned' | 'neutral';

export interface WeekStripDay {
  weekday: number; // 0 = Monday … 6 = Sunday
  localDate: string;
  status: DayStatus;
}

/** Mon–Sun for the week containing `today`. Never 'missed'/red (principle 3). */
export function computeWeekStrip(bootstrap: GymBootstrap, today: string): WeekStripDay[] {
  const start = weekStartOf(today);
  const doneDates = new Set(
    bootstrap.recentSessions.filter((s) => s.status === 'COMPLETED').map((s) => s.localDate),
  );
  const plannedWeekdays = new Set(
    (bootstrap.activeRoutine?.days ?? [])
      .map((d) => d.plannedWeekday)
      .filter((d): d is number => d !== null),
  );
  return Array.from({ length: 7 }, (_, weekday) => {
    const localDate = addDaysLocal(start, weekday);
    const status: DayStatus = doneDates.has(localDate)
      ? 'done'
      : plannedWeekdays.has(weekday)
        ? 'planned'
        : 'neutral';
    return { weekday, localDate, status };
  });
}

const WEEKDAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

/** UX-GYM-29: "Monday, done" / "Thursday, planned, today" — the strip dot is colour-only. */
export function weekStripDayLabel(day: WeekStripDay, today: string): string {
  const state = day.status === 'done' ? 'done' : day.status === 'planned' ? 'planned' : 'rest day';
  return `${WEEKDAY_NAMES[day.weekday]}, ${state}${day.localDate === today ? ', today' : ''}`;
}

/** "7-week streak" (+ a flex-week note when one was just spent — never guilt copy). */
export function formatStreakLine(streak: StreakInfo): string {
  const weeks = streakWeeksLabel(streak.current);
  if (streak.flexTokens <= 0) return weeks;
  const token = streak.flexTokens === 1 ? 'flex week' : 'flex weeks';
  return `${weeks} · ${streak.flexTokens} ${token} saved`;
}

function repsLabel(reps: readonly number[]): string {
  if (reps.length === 0) return '';
  const uniform = reps.every((r) => r === reps[0]);
  return uniform ? String(reps[0]) : reps.join('/');
}

/** "3 × 10 @ 62.5 kg" for a next-up exercise row. */
export function formatTarget(
  exercise: NextWorkoutExerciseDto,
  bootstrap: GymBootstrap,
  unit: WeightUnit,
): string {
  const meta = libraryLookup(bootstrap)(exercise.exerciseId);
  const load = formatLoad(exercise.suggestion.weightKg, unit, meta?.loadType ?? 'WEIGHTED', {
    each: meta?.perHand ?? false,
  });
  return `${exercise.sets} × ${repsLabel(exercise.suggestion.reps)} @ ${load}`;
}

/**
 * The workout to start for routine day `dayId` right now: the server-built
 * `nextWorkout` when that is the day (it carries "From last time"), else one
 * built on-device from the routine — the same build Gym Today's day picker uses.
 * Null without a set-up profile and routine, or an unknown day.
 */
export function workoutForDay(
  bootstrap: GymBootstrap,
  dayId: string,
  today: string,
): NextWorkoutDto | null {
  if (bootstrap.nextWorkout?.dayId === dayId) return bootstrap.nextWorkout;
  const routine = bootstrap.activeRoutine;
  if (!routine || !bootstrap.profile || !routine.days.some((d) => d.id === dayId)) return null;
  const progressions = new Map<string, ProgressionEntry>(
    bootstrap.progressions.map((p) => [
      progressionKey(p.exerciseId, p.repBucket),
      { state: p.state, override: p.override },
    ]),
  );
  return buildNextWorkout({
    routine,
    dayId,
    lookup: libraryLookup(bootstrap),
    progressions,
    profile: equipmentProfileOf(bootstrap.profile),
    facts: { experience: bootstrap.profile.experience, ageYears: null },
    today,
    recentSessions: bootstrap.recentSessions,
    isDeload: false,
  });
}

/**
 * UX-GYM-12: the device-local date training was set up (`setupCompletedAt` is
 * an instant), or null when unknown. Planned days before it are never "missed"
 * and the first week's goal is pro-rated from it.
 */
export function setupLocalDate(setupCompletedAt: string | null | undefined): string | null {
  if (!setupCompletedAt) return null;
  const at = new Date(setupCompletedAt);
  return Number.isNaN(at.getTime()) ? null : localDate(at);
}
