import type { MealPlanTailoring, PlanMealSlotJson } from '@chefer/database';
import type { PlanTailoring } from '@chefer/types';

// ─── Live tailoring: pure rules ───────────────────────────────────────────────
// "Instant week, then the chef tailors it live" (premium). The service queues
// a MealPlanTailoring job next to a curated week; PlanTailoringService runs it
// one day at a time. Everything here is pure, so the ordering, locking and
// merge rules are unit-tested without a database.

/** Wall-clock budget for one day: AI call(s) + validation. Past it the curated day stays. */
export const TAILORING_DAY_BUDGET_MS = 60_000;
/** The one corrective retry only runs when at least this much of the budget is left. */
export const TAILORING_RETRY_MIN_REMAINING_MS = 15_000;
/** Consecutive failures (capacity or not) before the job stops as PARTIAL/FAILED. */
export const TAILORING_MAX_STRIKES = 3;
/** First capacity back-off; doubles per strike (30 s, 60 s). */
export const TAILORING_CAPACITY_BACKOFF_MS = 30_000;
/** Claim lease — longer than a day's budget, so a live worker never loses its job. */
export const TAILORING_LEASE_MS = 150_000;
/** "Tailor the rest" re-queues per plan (no new quota reservation — see resumeTailoring). */
export const TAILORING_MAX_RESUMES = 3;

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const TYPE_ORDER = ['breakfast', 'lunch', 'dinner', 'snack'];
const MAIN_TYPES = new Set(['breakfast', 'lunch', 'dinner']);

/**
 * The order days are tailored in: the planned days (those with meals) from
 * TODAY on for the current week — today first, then the following days;
 * past days are left alone — and Monday first for a future week.
 */
export function tailoringDayOrder(
  days: { dayOfWeek: number; meals: unknown }[],
  weekOffset: number,
  todayIndex: number,
): number[] {
  const planned = days
    .filter((d) => Array.isArray(d.meals) && d.meals.length > 0)
    .map((d) => d.dayOfWeek)
    .sort((a, b) => a - b);
  return weekOffset <= 0 ? planned.filter((d) => d >= todayIndex) : planned;
}

/** Whole weeks between the current Monday and the plan's (0 = this week). */
export function weekOffsetOf(weekStartDate: Date, currentMonday: Date): number {
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  return Math.round((new Date(weekStartDate).getTime() - currentMonday.getTime()) / weekMs);
}

/**
 * Slots of `dayOfWeek` tailoring must not touch: the user's picks (`pinned`,
 * incl. placed favourites and kept picks), a leftovers lunch, and the dinner
 * that feeds the NEXT day's leftovers lunch — a pair is locked as a unit, so
 * "cook once, eat twice" can never break mid-week.
 */
export function lockedSlotIndexes(
  days: { dayOfWeek: number; meals: unknown }[],
  dayOfWeek: number,
): Set<number> {
  const meals = (days.find((d) => d.dayOfWeek === dayOfWeek)?.meals ?? []) as PlanMealSlotJson[];
  const next = (days.find((d) => d.dayOfWeek === dayOfWeek + 1)?.meals ?? []) as PlanMealSlotJson[];
  const feedsLeftovers = new Set(
    next.filter((m) => m.leftoverOf === DAY_NAMES[dayOfWeek]).map((m) => m.recipeId),
  );
  const locked = new Set<number>();
  meals.forEach((m, i) => {
    if (m.pinned || m.leftoverOf) locked.add(i);
    else if (m.type === 'dinner' && feedsLeftovers.has(m.recipeId)) locked.add(i);
  });
  return locked;
}

/**
 * The tailored day: locked slots stay exactly as they are; the AI's meals
 * fill every other meal type the day may hold (`slotTypes`, plus whatever
 * the curated day already had). A main meal the AI left out keeps its
 * curated slot — a tailored day is never emptier than the curated one.
 * Null when the AI contributed nothing usable (the curated day stays).
 */
export function mergeTailoredDay(
  current: PlanMealSlotJson[],
  locked: Set<number>,
  aiMeals: PlanMealSlotJson[],
  slotTypes: readonly string[],
): PlanMealSlotJson[] | null {
  const allowed = new Set([...slotTypes, ...current.map((m) => m.type)]);
  const lockedSlots = current.filter((_, i) => locked.has(i));
  const lockedTypes = new Set(lockedSlots.map((m) => m.type));
  const fromAi = aiMeals.filter((m) => allowed.has(m.type) && !lockedTypes.has(m.type));
  if (fromAi.length === 0) return null;
  const aiTypes = new Set(fromAi.map((m) => m.type));
  const keptCurated = current.filter(
    (m, i) => !locked.has(i) && MAIN_TYPES.has(m.type) && !aiTypes.has(m.type),
  );
  const rank = (type: string) => {
    const i = TYPE_ORDER.indexOf(type);
    return i === -1 ? TYPE_ORDER.length : i;
  };
  // Stable sort: same-type slots keep their relative order.
  return [...lockedSlots, ...keptCurated, ...fromAi]
    .map((m, i) => ({ m, i }))
    .sort((a, b) => rank(a.m.type) - rank(b.m.type) || a.i - b.i)
    .map(({ m }) => m);
}

/** Days the job did not tailor or keep: its queue plus the days that failed. */
export function untailoredDays(
  row: Pick<MealPlanTailoring, 'queuedDays' | 'failedDays'>,
): number[] {
  return [...new Set([...row.queuedDays, ...row.failedDays])];
}

/**
 * The DTO block for a plan read. A cancelled job (superseded by a newer
 * generation) or a plan that is no longer the week's active one shows
 * nothing. `canResume` = the plan is current, the job stopped early, there
 * are untailored days left from today on, and the resume cap isn't reached.
 */
export function toTailoringDto(
  row: MealPlanTailoring,
  planStatus: string | undefined,
  resumableDays: number[],
): PlanTailoring | null {
  if (row.status === 'CANCELLED') return null;
  const planActive = planStatus === undefined || planStatus === 'ACTIVE';
  if (!planActive && row.status === 'RUNNING') return null;
  const stopped = row.status === 'PARTIAL' || row.status === 'FAILED';
  return {
    status: row.status,
    tailoredDays: [...row.tailoredDays],
    totalDays: row.totalDays,
    currentDay: row.status === 'RUNNING' ? row.currentDay : null,
    queuedDays: stopped ? untailoredDays(row) : [...row.queuedDays],
    keptDays: [...row.keptDays],
    canResume:
      stopped && planActive && row.resumes < TAILORING_MAX_RESUMES && resumableDays.length > 0,
  };
}

/** Rejects with a TailoringTimeoutError once `ms` passes (the work itself is abandoned). */
export class TailoringTimeoutError extends Error {
  constructor(ms: number) {
    super(`tailoring day exceeded its ${ms} ms budget`);
    this.name = 'TailoringTimeoutError';
  }
}

export async function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TailoringTimeoutError(ms)), Math.max(0, ms));
  });
  try {
    return await Promise.race([work, deadline]);
  } finally {
    clearTimeout(timer);
  }
}
