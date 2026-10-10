import type { GymBootstrap, SessionSummaryDto } from '@chefer/types';
import {
  activityFacts,
  formatBodyWeight,
  formatDate,
  isActivityLogSession,
  type UnitSystem,
} from '@chefer/utils';
import type { RouterOutputs } from '../../../lib/trpc';

// Pure helpers behind the redesigned Today (10 Oct, boards Home / HomeDone).
// Every number here comes from data the API already returns.

type Summary = RouterOutputs['dashboard']['summary'];

/** "Sat 10 Oct" — the Today eyebrow, in the device locale. */
export function todayEyebrow(date: Date = new Date()): string {
  return formatDate(date, 'weekday-short').replace(',', '');
}

/** "Lunch" — a meal type as a label. */
export function mealTypeLabel(mealType: string): string {
  return mealType.charAt(0).toUpperCase() + mealType.slice(1);
}

export type DaySlotState = 'done' | 'next' | 'upcoming' | 'skipped';

export type DaySlot = {
  key: string;
  mealType: string;
  label: string;
  kcal: number;
  state: DaySlotState;
};

/**
 * One entry per planned slot today, in plan order: the plan's day (names,
 * kcal) joined with `today.slots` (what became of each slot, WP-06). "Next"
 * is the slot the Next meal card shows. Empty without a plan.
 */
export function yourDaySlots(summary: Summary): DaySlot[] {
  const day = summary.weekPlan.find((d) => d.dayOfWeek === summary.today.dayOfWeek);
  if (!day) return [];
  const statuses = summary.today.slots ?? [];
  const next = summary.nextMeal;
  return day.meals.map((meal, index) => {
    const status = statuses.find((s) => s.slotIndex === index)?.status ?? 'planned';
    const isNext =
      next !== null &&
      status === 'planned' &&
      (next.slotIndex !== undefined
        ? next.slotIndex === index
        : next.mealType === meal.mealType && next.recipe.id === meal.recipeId);
    const state: DaySlotState =
      status === 'eaten' || status === 'replaced'
        ? 'done'
        : status === 'skipped'
          ? 'skipped'
          : isNext
            ? 'next'
            : 'upcoming';
    return {
      key: `${meal.mealType}-${index}`,
      mealType: meal.mealType,
      label: mealTypeLabel(meal.mealType),
      kcal: Math.round(meal.kcal),
      state,
    };
  });
}

/** "1 of 4 eaten" (skipped slots leave the count, like the tracker's totals). */
export function eatenCountText(slots: readonly DaySlot[]): string {
  const counted = slots.filter((s) => s.state !== 'skipped');
  const done = counted.filter((s) => s.state === 'done').length;
  return `${done} of ${counted.length} eaten`;
}

export type WeightEntry = { id: string; weightKg: number; recordedAt: Date };

function sameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Whether the newest weigh-in was today (device-local day). */
export function weighedInToday(entries: readonly WeightEntry[], now: Date = new Date()): boolean {
  const latest = entries.at(-1);
  return latest !== undefined && sameLocalDay(new Date(latest.recordedAt), now);
}

/** "Last: 72.4 kg on Thursday" / "… yesterday" / "… on 3 Oct" (older than a week). */
export function lastWeighInText(
  entry: WeightEntry | undefined,
  system: UnitSystem,
  now: Date = new Date(),
): string | null {
  if (!entry) return null;
  const when = new Date(entry.recordedAt);
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(when)) / 86_400_000);
  const weight = formatBodyWeight(entry.weightKg, system);
  if (days <= 0) return `Last: ${weight} today`;
  if (days === 1) return `Last: ${weight} yesterday`;
  if (days < 7) return `Last: ${weight} on ${formatDate(when, 'weekday-long')}`;
  return `Last: ${weight} on ${formatDate(when, 'short')}`;
}

/**
 * "−0.8 kg in 30 days" — the change across the window the entries cover, or
 * null with fewer than two weigh-ins or no change worth showing.
 */
export function weightChangeText(
  entries: readonly WeightEntry[],
  system: UnitSystem,
  windowDays: number,
): string | null {
  const first = entries.at(0);
  const latest = entries.at(-1);
  if (!first || !latest || entries.length < 2) return null;
  const delta = latest.weightKg - first.weightKg;
  if (Math.abs(delta) < 0.05) return `No change in ${windowDays} days`;
  // A real minus sign reads better than a hyphen next to a number.
  return `${formatBodyWeight(delta, system, { signed: true }).replace('-', '−')} in ${windowDays} days`;
}

/** "18:40" in the device's own clock (same as the Recent workouts rows). */
export function clockTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export type DoneToday = {
  session: SessionSummaryDto;
  finishedAt: string;
  durationMin: number;
  workingSets: number;
  exercises: number;
  /** Only what the user entered for an activity — never an estimate of ours. */
  caloriesKcal: number | null;
};

/**
 * The latest session finished today, if any. A quick-logged activity (WP-20)
 * is not "today's workout" — it only counts with `includeActivities`.
 */
export function doneToday(
  bootstrap: Pick<GymBootstrap, 'recentSessions'>,
  today: string,
  { includeActivities = false }: { includeActivities?: boolean } = {},
): DoneToday | null {
  const finished = bootstrap.recentSessions
    .filter(
      (s) =>
        s.status === 'COMPLETED' &&
        s.localDate === today &&
        s.finishedAt !== null &&
        (includeActivities || !isActivityLogSession(s)),
    )
    .sort((a, b) => (b.finishedAt ?? '').localeCompare(a.finishedAt ?? ''));
  const session = finished[0];
  if (!session?.finishedAt) return null;
  const durationMin = Math.max(
    0,
    Math.round(
      (new Date(session.finishedAt).getTime() - new Date(session.startedAt).getTime()) / 60_000,
    ),
  );
  const workingSets = session.exercises.reduce(
    (n, ex) => n + ex.sets.filter((s) => !s.isWarmup && s.completed).length,
    0,
  );
  // kcal typed on an activity or a cardio set ("from your watch") — record only.
  const kcal = activityFacts(session).caloriesKcal;
  return {
    session,
    finishedAt: session.finishedAt,
    durationMin,
    workingSets,
    exercises: session.exercises.filter((e) => !e.skipped).length,
    caloriesKcal: kcal !== null && kcal > 0 ? Math.round(kcal) : null,
  };
}
