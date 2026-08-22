import { z } from 'zod';
import { shoppingListService } from '../application/shopping-list/shopping-list.service.js';
import { premiumProcedure, protectedProcedure, router } from '../lib/trpc.js';

export const shoppingListRouter = router({
  getForWeek: protectedProcedure
    .input(z.object({ weekOffset: z.number().int().min(-52).max(1).default(0) }))
    .query(async ({ ctx, input }) => {
      return shoppingListService.getForWeek(ctx.user.id, input.weekOffset);
    }),

  // AI consolidation is a premium feature — free users keep the
  // deterministic merge that getForWeek produces.
  /**
   * Synced check-off (P1-5): toggles item keys in the plan's checked set.
   * Per-key semantics — safe for two devices checking concurrently.
   */
  toggleItems: protectedProcedure
    .input(
      z.object({
        planId: z.string().min(1),
        keys: z.array(z.string().min(1).max(200)).min(1).max(200),
        checked: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return shoppingListService.toggleItems(ctx.user.id, input.planId, input.keys, input.checked);
    }),

  regenerate: premiumProcedure
    .input(z.object({ weekOffset: z.number().int().min(-52).max(1).default(0) }))
    .mutation(async ({ ctx, input }) => {
      return shoppingListService.regenerate(ctx.user.id, input.weekOffset);
    }),

  searchStores: protectedProcedure
    .input(
      z.object({
        planId: z.string().min(1),
        lat: z.number().optional(),
        lng: z.number().optional(),
        deliveryAddress: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return shoppingListService.searchStores(
        ctx.user.id,
        input.planId,
        input.lat,
        input.lng,
        input.deliveryAddress,
      );
    }),
});
