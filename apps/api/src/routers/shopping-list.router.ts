import { z } from 'zod';
import { listToggleAtSchema, localDateSchema } from '@chefer/types';
import { shoppingListService } from '../application/shopping-list/shopping-list.service.js';
import { householdPlanProcedure } from '../lib/household-middleware.js';
import { premiumProcedure, requireAiConsent, router } from '../lib/trpc.js';

// ADR 0003: every procedure reads and writes the HOUSEHOLD's list — the owner's
// (`ctx.planUser`) — while `ctx.user` (the caller) is who ticked or added.

const weekOffsetSchema = z.number().int().min(-52).max(1).default(0);

export const shoppingListRouter = router({
  getForWeek: householdPlanProcedure
    .input(z.object({ weekOffset: weekOffsetSchema }))
    .query(async ({ ctx, input }) => {
      // Full user (not just the id): household scaling is premium-shaped.
      return shoppingListService.getForWeek(ctx.planUser, input.weekOffset, ctx.user.id);
    }),

  /**
   * ADR 0003: the shared list's "anything new?" — ticks with who made them and
   * a `revision` that changes only when the items do. Polled while Shop is open.
   */
  sync: householdPlanProcedure
    .input(z.object({ weekOffset: weekOffsetSchema }))
    .query(async ({ ctx, input }) => {
      return shoppingListService.sync(ctx.planUser, input.weekOffset, ctx.user.id);
    }),

  /**
   * Synced check-off (P1-5): toggles item keys in the plan's checked set.
   * Per-key semantics — safe for two devices checking concurrently.
   */
  toggleItems: householdPlanProcedure
    .input(
      z.object({
        planId: z.string().min(1),
        keys: z.array(z.string().min(1).max(200)).min(1).max(200),
        checked: z.boolean(),
        /** Kitchen progress: the client's local day (optional, additive). */
        localDate: localDateSchema.optional(),
        /**
         * ADR 0003: when the toggle was made on the device (an offline replay
         * sends the original time). Optional, additive: absent = now.
         */
        at: listToggleAtSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return shoppingListService.toggleItems(
        ctx.planUser,
        input.planId,
        input.keys,
        input.checked,
        {
          actorId: ctx.user.id,
          ...(input.at && { at: new Date(input.at) }),
          ...(input.localDate && { localDate: input.localDate }),
        },
      );
    }),

  /**
   * User-added items (chat tool + the page's add-input). Stored in the
   * customItems overlay so they never shadow the derived list.
   */
  addCustomItems: householdPlanProcedure
    .input(
      z.object({
        planId: z.string().min(1),
        items: z
          .array(
            z.object({
              name: z.string().min(1).max(80),
              quantity: z.number().positive().max(999).optional(),
              unit: z.string().max(20).optional(),
            }),
          )
          .min(1)
          .max(20),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return shoppingListService.addCustomItems(
        ctx.planUser.id,
        input.planId,
        input.items,
        ctx.user.id,
      );
    }),

  removeCustomItem: householdPlanProcedure
    .input(z.object({ planId: z.string().min(1), key: z.string().min(1).max(200) }))
    .mutation(async ({ ctx, input }) => {
      return shoppingListService.removeCustomItem(ctx.planUser.id, input.planId, input.key);
    }),

  // FB7-10: the AI tidy-up is retired. Kept (with its old gates) only so shipped
  // binaries that still call it get a valid answer — it returns the derived list,
  // no AI call. New clients never call it.
  regenerate: premiumProcedure
    .use(requireAiConsent())
    .input(z.object({ weekOffset: z.number().int().min(-52).max(1).default(0) }))
    .mutation(async ({ ctx, input }) => {
      return shoppingListService.regenerate(ctx.user, input.weekOffset);
    }),
});
