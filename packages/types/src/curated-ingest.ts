import { z } from 'zod';

// ─── Curated recipe ingest (market review F1, 2026-10-22) ─────────────────────
// An admin pastes a recipe-video or web link; the extractor turns it into a
// DRAFT for the free (CURATED) pool, and an admin edits, approves or rejects
// it. These shapes are shared by the API and the web admin screens.
// See infrastructure.md §7 "Curated recipe ingest".

export const CURATED_DRAFT_STATUSES = [
  'EXTRACTING',
  'FAILED',
  'DRAFT',
  'APPROVED',
  'REJECTED',
  'UNPUBLISHED',
] as const;
export type CuratedDraftStatusId = (typeof CURATED_DRAFT_STATUSES)[number];

export const CURATED_MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export type CuratedMealType = (typeof CURATED_MEAL_TYPES)[number];

/** One ingredient line of a draft. `slug` is the GLOBAL catalog row it is. */
export const curatedDraftLineSchema = z.object({
  name: z.string().trim().min(1).max(80),
  quantity: z.number().positive().max(100_000),
  unit: z.string().trim().min(1).max(20),
  slug: z.string().trim().min(1).max(80).optional(),
  note: z.string().trim().max(200).optional(),
  optional: z.boolean().optional(),
});
export type CuratedDraftLine = z.infer<typeof curatedDraftLineSchema>;

/**
 * The editable recipe a draft holds. Nutrition is never part of it: approval
 * computes it from the catalog.
 */
export const curatedDraftRecipeSchema = z.object({
  name: z.string().trim().max(120),
  description: z.string().trim().max(500),
  ingredients: z.array(curatedDraftLineSchema).max(40),
  instructions: z.array(z.string().trim().min(1).max(500)).max(30),
  cuisineType: z.string().trim().max(60),
  dietaryTags: z.array(z.string().trim().min(1).max(30)).max(10),
  prepTimeMins: z
    .number()
    .int()
    .min(0)
    .max(24 * 60),
  cookTimeMins: z
    .number()
    .int()
    .min(0)
    .max(24 * 60),
  servings: z.number().int().min(1).max(20),
});
export type CuratedDraftRecipe = z.infer<typeof curatedDraftRecipeSchema>;

/** Copy for the admin screens and the API's errors, in one place. */
export const CURATED_INGEST_COPY = {
  dailyCapReached: (cap: number) =>
    `Today's curated ingest cap (${cap}) is used up. It resets at midnight UTC; raise CURATED_INGEST_DAILY_CAP to allow more.`,
  aiQuotaExhausted:
    "The AI provider's quota is used up (Gemini's free tier allows about 20 requests a day). Try again tomorrow, or add a paid key.",
  duplicate: (status: string) => `This link is already in the curated queue (${status}).`,
  proseNotRewritten:
    "The name, description and steps are still the creator's words. Rewrite them in Chefer's voice (or edit them yourself) before approving.",
  unresolvedLines: (names: string[]) =>
    `Every ingredient needs a catalog match before approval. Unmatched: ${names.join(', ')}.`,
  incomplete:
    'A recipe needs a name, a description, at least one ingredient, at least one step and a meal type before approval.',
} as const;
