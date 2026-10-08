import { z } from 'zod';
import { shoppingListService } from '../application/shopping-list/shopping-list.service.js';
import {
  aiConsentProcedure,
  premiumProcedure,
  protectedProcedure,
  requireAiConsent,
  router,
} from '../lib/trpc.js';

export const shoppingListRouter = router({
  getForWeek: protectedProcedure
    .input(z.object({ weekOffset: z.number().int().min(-52).max(1).default(0) }))
    .query(async ({ ctx, input }) => {
      // Full user (not just the id): household scaling is premium-shaped.
      return shoppingListService.getForWeek(ctx.user, input.weekOffset);
    }),

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
      return shoppingListService.toggleItems(ctx.user, input.planId, input.keys, input.checked);
    }),

  /**
   * User-added items (chat tool + the page's add-input). Stored in the
   * customItems overlay so they never shadow the derived list.
   */
  addCustomItems: protectedProcedure
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
      return shoppingListService.addCustomItems(ctx.user.id, input.planId, input.items);
    }),

  removeCustomItem: protectedProcedure
    .input(z.object({ planId: z.string().min(1), key: z.string().min(1).max(200) }))
    .mutation(async ({ ctx, input }) => {
      return shoppingListService.removeCustomItem(ctx.user.id, input.planId, input.key);
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

  // The real store search (GROCERY_AI_MOCK_ENABLED=false) sends the list and
  // the location to the AI provider.
  searchStores: aiConsentProcedure
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
        ctx.user,
        input.planId,
        input.lat,
        input.lng,
        input.deliveryAddress,
      );
    }),
});
