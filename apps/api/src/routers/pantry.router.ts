import { z } from 'zod';
import { pantryService } from '../application/pantry/pantry.service.js';
import { premiumProcedure, protectedProcedure, router } from '../lib/trpc.js';

// ─── Pantry router (F3 Zero-Waste Kitchen) ────────────────────────────────────
// Thin wrapper over PantryService. Reading is free for every tier (the pantry
// page renders read-only with the upsell for free accounts — §6.4); every
// mutation that MANAGES the kitchen is premium. Seeding from shopping-list
// check-offs happens inside shoppingList.toggleItems, not here.

export const pantryRouter = router({
  /** All items, oldest first — free tier sees them read-only. */
  list: protectedProcedure.query(async ({ ctx }) => {
    return pantryService.list(ctx.user.id);
  }),

  /** Manual add/edit ("MANUAL" source). Staples are rejected. */
  addItem: premiumProcedure
    .input(
      z.object({
        name: z.string().min(1).max(80),
        quantity: z.number().positive().max(9999).optional(),
        unit: z.string().min(1).max(20),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return pantryService.addManual(ctx.user.id, input);
    }),

  /** Removes one row (pantry page delete). */
  removeItem: premiumProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await pantryService.removeItem(ctx.user.id, input.id);
      return { ok: true };
    }),

  /**
   * "I'm out of it" — clears every row for the ingredient (any unit). The
   * shopping list's one-tap re-add on a "have it" item: the item returns to
   * the buy list and the estimated total on the next read.
   */
  markOutOfStock: premiumProcedure
    .input(z.object({ ingredientName: z.string().min(1).max(80) }))
    .mutation(async ({ ctx, input }) => {
      return pantryService.markOutOfStock(ctx.user.id, input.ingredientName);
    }),

  /**
   * Weekly confirm ("still have these?"): tapped ids are cleared; kept rows
   * older than a week decay to the "some" state (quantity 0).
   */
  confirmWeekly: premiumProcedure
    .input(z.object({ clearIds: z.array(z.string().min(1)).max(500) }))
    .mutation(async ({ ctx, input }) => {
      return pantryService.confirmWeekly(ctx.user.id, input.clearIds);
    }),
});
