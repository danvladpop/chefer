import type { IMealPlanRepository } from '@chefer/database';
import { getWeekStartDate, weekStartForDate } from '@chefer/utils';

// ─── Plan resolution (UX-FOOD-02, UX-PLAN-09) ──────────────────────────────────
// "The plan for date X" / "this week's plan" is the plan whose WEEK matches —
// never "the newest ACTIVE plan". Opening next week on Plan silently creates a
// carry-forward plan that becomes the newest ACTIVE one, so
// `findActiveWithDays` handed the tracker, the post-log rebalance, the coach
// and the pantry next week's meals. Today, Plan and Shop already resolve by
// week (B-13); every other reader goes through these two functions so they
// can't drift apart again.

/** The one repository method both resolvers need (keeps test mocks tiny). */
export type PlanWeekReader = Pick<IMealPlanRepository, 'findForWeek'>;

type PlanWithDays = NonNullable<Awaited<ReturnType<IMealPlanRepository['findForWeek']>>>;

/**
 * The user's plan for the week containing `dateStr` (`YYYY-MM-DD`, the
 * client's local day), or null when that week has none.
 */
export function planForDate(
  repo: PlanWeekReader,
  userId: string,
  dateStr: string,
): Promise<PlanWithDays | null> {
  return repo.findForWeek(userId, weekStartForDate(dateStr));
}

/** The user's plan for the current (server-local) calendar week, or null. */
export function planForThisWeek(
  repo: PlanWeekReader,
  userId: string,
  now: Date = new Date(),
): Promise<PlanWithDays | null> {
  return repo.findForWeek(userId, getWeekStartDate(0, now));
}
