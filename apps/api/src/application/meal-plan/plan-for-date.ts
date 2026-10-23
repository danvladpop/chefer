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

// Household sharing (ADR 0003): a partner's "plan for date X" is the household
// owner's, shown at the partner's own portion. Both resolvers go through
// `planScope`, so the tracker, the coach and the pantry all see the shared week
// without knowing about households. Fit and rebalance are unaffected: they
// re-read the plan with `findByIdForUser(partner, …)`, which finds nothing, so a
// partner's log never resizes the owner's portions.

/** Whose plan a user reads, and the portion they eat of it (null = the stored one). */
export type PlanScope = { planUserId: string; partnerPortion: number | null };
export type PlanScopeResolver = (userId: string) => Promise<PlanScope>;

/** Lazy, fail-closed to "own plan": the household seam loads env + flags. */
export async function householdPlanScope(userId: string): Promise<PlanScope> {
  try {
    const { householdAccess } = await import('../household/household-access.service.js');
    const scope = await householdAccess.scope(userId);
    return scope.role === 'PARTNER'
      ? { planUserId: scope.planUserId, partnerPortion: scope.portion }
      : { planUserId: userId, partnerPortion: null };
  } catch {
    return { planUserId: userId, partnerPortion: null };
  }
}

/** A read-only copy of the plan with every slot at the partner's portion. */
export function atPortion<P extends { days: { meals: unknown }[] }>(plan: P, portion: number): P {
  return {
    ...plan,
    days: plan.days.map((d) => ({
      ...d,
      meals: (d.meals as { portion?: number }[]).map(({ portion: _own, ...slot }) => ({
        ...slot,
        ...(portion !== 1 && { portion }),
      })),
    })),
  };
}

async function scoped(
  repo: PlanWeekReader,
  userId: string,
  weekStart: Date,
  scope: PlanScopeResolver,
): Promise<PlanWithDays | null> {
  const { planUserId, partnerPortion } = await scope(userId);
  const plan = await repo.findForWeek(planUserId, weekStart);
  return plan && partnerPortion !== null ? atPortion(plan, partnerPortion) : plan;
}

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
  scope: PlanScopeResolver = householdPlanScope,
): Promise<PlanWithDays | null> {
  return scoped(repo, userId, weekStartForDate(dateStr), scope);
}

/** The user's plan for the current (server-local) calendar week, or null. */
export function planForThisWeek(
  repo: PlanWeekReader,
  userId: string,
  now: Date = new Date(),
  scope: PlanScopeResolver = householdPlanScope,
): Promise<PlanWithDays | null> {
  return scoped(repo, userId, getWeekStartDate(0, now), scope);
}
