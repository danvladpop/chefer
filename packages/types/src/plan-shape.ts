import { z } from 'zod';

// ─── Plan shape (§2.3, T-07.1) ─────────────────────────────────────────────────
// Stored on DietaryPreferences (planSlots/planDays/timeCapMins/weekendNoLimit/
// cookingFor/leftovers, S1). Every default reproduces today's plan (7 days,
// breakfast/lunch/dinner, no time cap) — an existing user who never opens the
// form gets the same week (UX-07 AC7).

export const planSlotSchema = z.enum(['breakfast', 'lunch', 'dinner', 'snack']);
export type PlanSlot = z.infer<typeof planSlotSchema>;

export const planShapeSchema = z.object({
  slots: z.array(planSlotSchema).min(1).max(4),
  days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  timeCapMins: z.union([z.literal(15), z.literal(30), z.literal(45)]).nullable(),
  weekendNoLimit: z.boolean(),
  cookingFor: z.union([z.literal(1), z.literal(2)]).nullable(),
});
export type PlanShape = z.infer<typeof planShapeSchema>;

/**
 * What `mealPlan.setShape` accepts: the shape, `leftovers` (bug B-27) and the
 * saved `Fit meals to training days` choice (T-06.7 follow-up, 2026-10-10).
 * `fitTrainingDays` is optional so clients that predate it never reset it:
 * omitted = leave the stored value alone, null = back to "not chosen" (the
 * default: on for lifters whose goal gets the training-day bump).
 */
export const planSettingsInputSchema = planShapeSchema.extend({
  leftovers: z.boolean(),
  fitTrainingDays: z.boolean().nullable().optional(),
});
export type PlanSettingsInput = z.infer<typeof planSettingsInputSchema>;

/** [] on DietaryPreferences.planSlots/planDays means "legacy" — see planShapeSummary in @chefer/utils. */
export const LEGACY_PLAN_SLOTS: readonly PlanSlot[] = ['breakfast', 'lunch', 'dinner'];
export const LEGACY_PLAN_DAYS: readonly number[] = [0, 1, 2, 3, 4, 5, 6];
