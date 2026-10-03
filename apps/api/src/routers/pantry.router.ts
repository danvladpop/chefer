import { z } from 'zod';
import { pantryService } from '../application/pantry/pantry.service.js';
import { premiumProcedure, protectedProcedure, router } from '../lib/trpc.js';

// ─── Pantry router (F3 Zero-Waste Kitchen) ────────────────────────────────────
// Thin wrapper over PantryService. Reading is free for every tier (the pantry
// page renders read-only with the upsell for free accounts — §6.4); adding by
// hand, "out of it" and the weekly confirm are premium. Removing, editing and
// restoring a row are open to every tier (UX-SHOP-05). Seeding from shopping-list
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

  /**
   * Removes one row — every tier (UX-SHOP-05). `ok` is unchanged for shipped
   * clients; `removed` (additive) is the row, for an Undo.
   */
  removeItem: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const removed = await pantryService.removeItem(ctx.user.id, input.id);
      return { ok: true, removed };
    }),

  /** Edits a row's amount (null = "some") and unit — every tier (UX-SHOP-05). */
  updateItem: protectedProcedure
    .input(
      z.object({
        id: z.string().min(1),
        quantity: z.number().positive().max(9999).nullable(),
        unit: z.string().min(1).max(20),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return pantryService.updateItem(ctx.user.id, input.id, input);
    }),

  /** Undo of `removeItem`: puts the row back as it was — every tier. */
  restoreItem: protectedProcedure
    .input(
      z.object({
        ingredientName: z.string().min(1).max(80),
        quantity: z.number().positive().max(9999).optional(),
        unit: z.string().min(1).max(20),
        source: z.enum(['PURCHASE', 'MANUAL']),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return pantryService.restoreItem(ctx.user.id, input);
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
