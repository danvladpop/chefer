import { z } from 'zod';
import { householdService } from '../application/household/household.service.js';
import { premiumProcedure, protectedProcedure, router } from '../lib/trpc.js';

// ─── Household router (F2) ────────────────────────────────────────────────────
// Thin wrapper per CLAUDE.md. Member creation/editing is premium (matrix key
// `householdPlans`; the count cap comes from `householdMembers` inside the
// service). `list` and `remove` stay protected: members created while premium
// keep filtering plans after a downgrade (safety is never premium), so a
// free-again user must still be able to see and remove them.

const memberFieldsSchema = z.object({
  name: z.string().trim().min(1).max(60),
  /** 0.5 kid … 1.5 big eater. */
  portionFactor: z.number().min(0.25).max(3).default(1),
  isKid: z.boolean().default(false),
  dietaryRestrictions: z.array(z.string().max(60)).max(20).default([]),
  allergies: z.array(z.string().max(60)).max(20).default([]),
  dislikedIngredients: z.array(z.string().max(60)).max(30).default([]),
});

export const householdRouter = router({
  /** All of the user's household members (empty array on any tier). */
  list: protectedProcedure.query(async ({ ctx }) => {
    return householdService.list(ctx.user.id);
  }),

  /** Adds a member — capped by PLAN_FEATURES.householdMembers. */
  add: premiumProcedure.input(memberFieldsSchema).mutation(async ({ input, ctx }) => {
    return householdService.add(ctx.user, input);
  }),

  update: premiumProcedure
    .input(memberFieldsSchema.partial().extend({ id: z.string().cuid() }))
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
