import { z } from 'zod';

/** The four meal types a plan slot can have. */
export const planSlotMealTypeSchema = z.enum(['breakfast', 'lunch', 'dinner', 'snack']);

/**
 * `mealPlan.removeSlot` (FB7-04): removes ONE slot of a day when another slot
 * of the same meal type remains (a side dish added to a meal). Removing the
 * only breakfast/lunch/dinner is "Skip it", not this. Same shape as
 * `mealPlan.setSlotPinned` minus `pinned`.
 */
export const removeSlotInputSchema = z.object({
  planId: z.string().min(1),
  dayOfWeek: z.number().int().min(0).max(6),
  mealType: planSlotMealTypeSchema,
  slotIndex: z.number().int().min(0).max(20),
});
export type RemoveSlotInput = z.infer<typeof removeSlotInputSchema>;
