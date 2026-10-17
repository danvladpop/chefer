import { TRPCError } from '@trpc/server';
import { mealPlanRepository } from '@chefer/database';
import type { UserProfile } from '@chefer/types';
import { localDateStr } from '@chefer/utils';
import { hasFeature } from '../../lib/entitlements.js';
import { planForDate } from './plan-for-date.js';
import {
  applyRebalanceSwaps,
  previewRebalance,
  type RebalancePreview,
  type RebalanceResult,
  type RequestedSwap,
} from './rebalance.js';

// ─── Week rebalance — preview / apply (WP-07, UX-PLAN-09) ─────────────────────
// The two procedures behind `mealPlan.previewRebalance` / `mealPlan.applyRebalance`.
// Gated by the `weekRebalance` feature (free + premium: no AI on this path).
// The selection and the writes live in rebalance.ts; this layer only checks
// the entitlement and resolves which plan a call means.

function assertAllowed(user: UserProfile): void {
  if (!hasFeature(user, 'weekRebalance')) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: "Week rebalance isn't available on your plan.",
    });
  }
}

export const rebalanceService = {
  /**
   * What a rebalance would do now, without doing it — also what Plan's "Rebalance
   * my week" shows. `planId` defaults to the plan of the week containing
   * `localDate` (the client's local today; the server's own when omitted).
   * Null = nothing to offer.
   */
  async preview(
    user: UserProfile,
    input: { planId?: string | undefined; localDate?: string | undefined },
  ): Promise<RebalancePreview | null> {
    assertAllowed(user);
    const localDate = input.localDate ?? localDateStr(new Date());
    const planId =
      input.planId ?? (await planForDate(mealPlanRepository, user.id, localDate))?.id ?? null;
    if (!planId) return null;
    return previewRebalance(user.id, planId, { localDate });
  },

  /** Applies the swaps the user accepted. Same result shape as the auto path, so Undo is unchanged. */
  async apply(
    user: UserProfile,
    input: {
      planId: string;
      swaps: RequestedSwap[];
      localDate?: string | undefined;
    },
  ): Promise<RebalanceResult> {
    assertAllowed(user);
    return applyRebalanceSwaps(user.id, input.planId, input.swaps, {
      localDate: input.localDate ?? localDateStr(new Date()),
    });
  },
};
