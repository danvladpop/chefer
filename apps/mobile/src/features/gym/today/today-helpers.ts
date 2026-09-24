import type {
  GymBootstrap,
  GymOffer,
  GymOfferKind,
  NextWorkoutExerciseDto,
  StreakInfo,
  WeightUnit,
} from '@chefer/types';
import { addDaysLocal, formatLoad, weekStartOf } from '@chefer/utils';
import { libraryLookup } from '../use-gym-bootstrap';

// Pure helpers for the Today tab (gym_plan.md §1.3 "Today tab", §1.4 habit
// mechanics) — kept dependency-free of React so they're trivial to unit test.

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

const OFFER_PRIORITY: readonly GymOfferKind[] = ['comeback', 'deload', 'stall', 'recap'];

/** At most one offer card at a time, in priority order (§1.3 "Contextual cards"). */
export function pickOffer(offers: readonly GymOffer[]): GymOffer | null {
  for (const kind of OFFER_PRIORITY) {
    const found = offers.find((o) => o.kind === kind);
    if (found) return found;
  }
  return null;
}

/** "7-week streak" (+ a flex-week note when one was just spent — never guilt copy). */
export function formatStreakLine(streak: StreakInfo): string {
  const weeks = streak.current === 1 ? '1-week streak' : `${streak.current}-week streak`;
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
  const load = formatLoad(exercise.suggestion.weightKg, unit, meta?.loadType ?? 'WEIGHTED');
  return `${exercise.sets} × ${repsLabel(exercise.suggestion.reps)} @ ${load}`;
}
