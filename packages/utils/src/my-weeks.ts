// ─── My weeks: past weeks, one card each (audit F-PLAN-6-3, P2-8) ───────────
// "Past plans" listed future weeks (next week, even 2027) plus every
// regenerate and carry-forward copy as near-identical cards, sorted by
// creation time. My weeks shows past weeks only, one card per week, newest
// week first.

const DAY_MS = 24 * 60 * 60 * 1000;

export interface PlanWeekLike {
  id: string;
  weekStartDate: Date | string;
  status: string;
  createdAt: Date | string;
}

/**
 * The calendar week a plan belongs to, as a day number. Rounded, not
 * floored: the server stores Monday midnight in its own time zone (e.g.
 * 21:00Z the day before for UTC+3), and rounding lands every copy of the same
 * week on the same key.
 */
function weekKey(plan: PlanWeekLike): number {
  return Math.round(new Date(plan.weekStartDate).getTime() / DAY_MS);
}

/**
 * Past weeks for the My weeks page.
 *
 * - Past only: a week counts once all seven of its days are over, so the
 *   current and future weeks (which live on the planner) are left out.
 * - One plan per week: the ACTIVE one when there is one, otherwise the most
 *   recently created copy (the last regenerate the user saw).
 * - Newest week first.
 */
export function pastWeeks<T extends PlanWeekLike>(
  plans: readonly T[],
  now: Date = new Date(),
): T[] {
  const byWeek = new Map<number, T>();
  for (const plan of plans) {
    const start = new Date(plan.weekStartDate).getTime();
    if (Number.isNaN(start) || start + 7 * DAY_MS > now.getTime()) continue;
    const key = weekKey(plan);
    const kept = byWeek.get(key);
    if (!kept || prefer(plan, kept)) byWeek.set(key, plan);
  }
  return [...byWeek.values()].sort((a, b) => weekKey(b) - weekKey(a));
}

function prefer(candidate: PlanWeekLike, kept: PlanWeekLike): boolean {
  const candidateActive = candidate.status === 'ACTIVE';
  const keptActive = kept.status === 'ACTIVE';
  if (candidateActive !== keptActive) return candidateActive;
  return new Date(candidate.createdAt).getTime() > new Date(kept.createdAt).getTime();
}
