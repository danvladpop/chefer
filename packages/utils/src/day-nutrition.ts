// ─── Home "Today" nutrition (audit F-DASH-1-2) ────────────────────────────────
// The home ring used to show PLANNED food: "540 remaining · Under target"
// while 6,070 kcal had actually been logged. It now shows what was eaten
// against the target; the chip judges the plan (is today's plan sized for
// the target?) and says so — one rule set for web and mobile.

export type PlanStatus = 'on' | 'under' | 'over' | 'none';

/** Is today's PLAN sized for the target (±15% / +5%)? Empty = unplanned, not "under". */
export function planStatus(plannedKcal: number, targetKcal: number): PlanStatus {
  if (plannedKcal <= 0) return 'none';
  const ratio = plannedKcal / (targetKcal || 1);
  return ratio > 1.05 ? 'over' : ratio < 0.85 ? 'under' : 'on';
}

export const PLAN_STATUS_LABEL: Record<PlanStatus, string> = {
  on: 'Plan on track',
  under: 'Plan under target',
  over: 'Plan over target',
  none: 'Nothing planned',
};

/** "1,870 planned · 1,200 left" — left = target − eaten, never negative. */
export function dayNutritionCaption(
  eatenKcal: number,
  plannedKcal: number,
  targetKcal: number,
): string {
  const left = Math.max(targetKcal - eatenKcal, 0);
  const over = eatenKcal - targetKcal;
  const leftPart =
    over > 0 ? `${over.toLocaleString('en-US')} over` : `${left.toLocaleString('en-US')} left`;
  return plannedKcal > 0
    ? `${plannedKcal.toLocaleString('en-US')} planned · ${leftPart}`
    : leftPart;
}

// ─── Today's status (UX-FOOD-05) ──────────────────────────────────────────────
// `planStatus` judges the PLAN alone, so Today showed a green "Plan on track"
// pill at 871 kcal over target. Today's pill instead looks at what was eaten
// plus what is still planned for the rest of the day. The wording stays
// neutral: no red, no scolding — an overshoot is information, not a failure.

export type DayStatus = 'none' | 'under' | 'on' | 'heading_over' | 'over';

export type DayStatusResult = {
  status: DayStatus;
  /** Pill text — "On track", "Heading over", "Over by 871 kcal". */
  label: string;
  /** kcal eaten beyond the target; 0 unless status is `over`. */
  overByKcal: number;
};

const DAY_STATUS_LABEL: Record<Exclude<DayStatus, 'over'>, string> = {
  none: 'Nothing planned',
  under: 'Room for more',
  on: 'On track',
  heading_over: 'Heading over',
};

/**
 * Today's status from eaten + the planned meals still to come, against the
 * target (same ±15% / +5% band as `planStatus` for the projection).
 *
 * @param remainingPlannedKcal planned meals not yet eaten today (next meal +
 *   the rest of today); pass 0 when none is left.
 */
export function dayStatus(
  eatenKcal: number,
  remainingPlannedKcal: number,
  targetKcal: number,
): DayStatusResult {
  const eaten = Math.max(Math.round(eatenKcal), 0);
  const remaining = Math.max(Math.round(remainingPlannedKcal), 0);
  const target = targetKcal || 1;
  if (eaten > target) {
    const overByKcal = eaten - target;
    return {
      status: 'over',
      label: `Over by ${overByKcal.toLocaleString('en-US')} kcal`,
      overByKcal,
    };
  }
  // Nothing eaten and nothing left to eat: an unplanned day, not "under".
  if (eaten + remaining <= 0)
    return { status: 'none', label: DAY_STATUS_LABEL.none, overByKcal: 0 };
  const ratio = (eaten + remaining) / target;
  const status: DayStatus = ratio > 1.05 ? 'heading_over' : ratio < 0.85 ? 'under' : 'on';
  return { status, label: DAY_STATUS_LABEL[status], overByKcal: 0 };
}

/** Planned kcal still to come today: the next meal plus the rest of the day (`dashboard.summary`). */
export function remainingPlannedKcal(
  nextMeal: { recipe: { kcal: number } } | null | undefined,
  restOfToday: readonly { kcal: number }[] | undefined,
): number {
  return (
    (nextMeal?.recipe.kcal ?? 0) + (restOfToday ?? []).reduce((sum, meal) => sum + meal.kcal, 0)
  );
}
