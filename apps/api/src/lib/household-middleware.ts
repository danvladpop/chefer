import {
  householdAccess,
  type HouseholdScope,
} from '../application/household/household-access.service.js';
import { protectedProcedure } from './trpc.js';

// ─── Household scope (ADR 0003) ───────────────────────────────────────────────
// Resolves ONCE per request whose plan and list the caller touches. Plan and
// list procedures read `ctx.household.planUserId` instead of `ctx.user.id`; a
// partner's planUserId is the owner's. `ctx.user` stays the caller, so logs,
// targets, consent and analytics are always their own.

export const householdScopedProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const household: HouseholdScope = await householdAccess.scope(ctx.user.id);
  return next({ ctx: { ...ctx, household } });
});

/**
 * Plan edits a partner may make (swap, replace, pin, remove): the services run
 * as the household owner — `ctx.planUser` decides tier, safety and portions —
 * exactly as if the owner had made the change.
 */
export const householdPlanProcedure = householdScopedProcedure.use(async ({ ctx, next }) => {
  const planUser = await householdAccess.planUser(ctx.user, ctx.household);
  return next({ ctx: { ...ctx, planUser } });
});

/** Owner-only plan actions (generate, follow a saved week, …): FORBIDDEN for a partner. */
export const householdOwnerProcedure = householdScopedProcedure.use(({ ctx, next }) => {
  householdAccess.assertNotPartner(ctx.household);
  return next();
});
