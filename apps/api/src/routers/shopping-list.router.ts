import { z } from 'zod';
import { shoppingListService } from '../application/shopping-list/shopping-list.service.js';
import { protectedProcedure, router } from '../lib/trpc.js';

export const shoppingListRouter = router({
  getForWeek: protectedProcedure
    .input(z.object({ weekOffset: z.number().int().min(-52).max(1).default(0) }))
    .query(async ({ ctx, input }) => {
      return shoppingListService.getForWeek(ctx.user.id, input.weekOffset);
    }),

  regenerate: protectedProcedure
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
