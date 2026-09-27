import { z } from 'zod';

// ─── Manual recipe form contract (T-40.1, UX-40 slice 1) ──────────────────────
// Shared shapes for the create/edit recipe form, so mobile and web build the
// same pickers and the same "what's missing" copy instead of drifting.

/** Cuisine presets — moved from web `recipes/new/page.tsx` (single source now). */
export const CUISINE_PRESETS = [
  'Italian',
  'Mediterranean',
  'Mexican',
  'Asian',
  'Thai',
  'Japanese',
  'Chinese',
  'Indian',
  'French',
  'American',
  'Middle Eastern',
  'Romanian',
] as const;

/**
 * Canonical unit options for recipe forms — moved from
 * `apps/api/src/lib/ingredient-prices/index.ts`, which re-exports this for
 * its own (price-estimation) callers. Keep in sync with that module's
 * `UNIT_TABLE` keys.
 */
export const RECIPE_UNITS = [
  'g',
  'kg',
  'ml',
  'l',
  'tsp',
  'tbsp',
  'cup',
  'piece',
  'small',
  'medium',
  'large',
  'clove',
  'slice',
  'can',
  'bunch',
  'pinch',
] as const;
export type RecipeUnit = (typeof RECIPE_UNITS)[number];

/** RECIPE_UNITS grouped for the unit `SelectSheet` (PAT-15). */
export const RECIPE_UNIT_GROUPS: readonly { label: string; units: readonly RecipeUnit[] }[] = [
  { label: 'Weight', units: ['g', 'kg'] },
  { label: 'Volume', units: ['ml', 'l', 'tsp', 'tbsp', 'cup'] },
  {
    label: 'Count',
    units: ['piece', 'small', 'medium', 'large', 'clove', 'slice', 'can', 'bunch', 'pinch'],
  },
] as const;

/**
 * D-18: fiber is still STORED (an old client's payload, and web's computed
 * nutrition, both still carry it) but the manual form never shows a fiber
 * input or default on either platform.
 */
export const recipeNutritionSourceSchema = z.enum(['manual', 'computed', 'none']);
export type RecipeNutritionSource = z.infer<typeof recipeNutritionSourceSchema>;

export interface RecipeFormIngredientLine {
  name: string;
  quantity: string;
  unit: string;
}
