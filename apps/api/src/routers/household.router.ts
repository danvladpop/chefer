import { z } from 'zod';
import { householdMemberFieldsSchema } from '@chefer/types';
import { householdService } from '../application/household/household.service.js';
import { protectedProcedure, router } from '../lib/trpc.js';

// ─── Household router (F2, backlog P2-3) ──────────────────────────────────────
// Thin wrapper per CLAUDE.md. Every procedure is open to every tier since
// P2-3: members' allergies and restrictions are safety, and safety is never
// premium. The count cap comes from `householdMembers` inside the service;
// portion SCALING (`householdPlans`) is enforced where lists and costs are
// built, not here.

export const householdRouter = router({
  /** All of the user's household members (empty array when it's just them). */
  list: protectedProcedure.query(async ({ ctx }) => {
    return householdService.list(ctx.user.id);
  }),

  /** Adds a member — capped by PLAN_FEATURES.householdMembers, race-free. */
  add: protectedProcedure.input(householdMemberFieldsSchema).mutation(async ({ input, ctx }) => {
    return householdService.add(ctx.user, input);
  }),

  update: protectedProcedure
    .input(householdMemberFieldsSchema.partial().extend({ id: z.string().cuid() }))
    .mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      return householdService.update(ctx.user.id, id, data);
    }),

  remove: protectedProcedure
    .input(z.object({ id: z.string().cuid() }))
    .mutation(async ({ input, ctx }) => {
      return householdService.remove(ctx.user.id, input.id);
    }),
});
