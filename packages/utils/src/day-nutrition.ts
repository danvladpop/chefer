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
