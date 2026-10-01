import type { RouterOutputs } from '@/lib/trpc';
import type { IngredientCategory, NutritionSource } from '@chefer/types';
import type { NutritionIngredient } from '@chefer/utils';

// ─── A catalog row as a recipe line holds it (plan-ingredient-catalog §10) ────
// search, resolve, catalogList and createCustom each return a slightly
// different shape; the recipe forms keep this one.

export interface PickedIngredient {
  id: string;
  /** Display name ("Chicken breast, raw"). */
  name: string;
  category: IngredientCategory;
  owner: 'global' | 'mine';
  portions: { unit: string; grams: number }[];
  hasDensity: boolean;
  nutritionSource: NutritionSource;
}

type SearchRow = RouterOutputs['ingredients']['search'][number];
type ResolveRef = NonNullable<RouterOutputs['ingredients']['resolve'][number]['match']>;
type Detail = RouterOutputs['ingredients']['getMany'][number];

/**
 * A search (or createCustom) row as a picked ingredient. Null for a legacy
 * custom row with no catalog twin yet, which cannot be linked.
 */
export function pickedFromSearch(row: SearchRow): PickedIngredient | null {
  if (!row.id || !row.category || !row.nutritionSource) return null;
  return {
    id: row.id,
    name: row.displayName,
    category: row.category,
    owner: row.owner ?? (row.isCustom ? 'mine' : 'global'),
    portions: row.portions ?? [],
    hasDensity: row.hasDensity ?? false,
    nutritionSource: row.nutritionSource,
  };
}

/** A resolver / catalog reference (resolve, import resolution, getMany, catalogList). */
export function pickedFromRef(ref: ResolveRef | Detail): PickedIngredient {
  return {
    id: ref.id,
    name: ref.name,
    category: ref.category,
    owner: ref.owner,
    portions: ref.portions.map((p) => ({ unit: p.unit, grams: p.grams })),
    hasDensity: ref.hasDensity,
    nutritionSource: ref.nutritionSource,
  };
}

/** A `getMany` detail as the shared engine's ingredient. */
export function toNutritionIngredient(d: Detail): NutritionIngredient {
  return {
    id: d.id,
    kcalPer100g: d.per100g.calories,
    proteinPer100g: d.per100g.protein,
    carbsPer100g: d.per100g.carbs,
    fatPer100g: d.per100g.fat,
    fiberPer100g: d.per100g.fiber,
    densityGPerMl: d.densityGPerMl,
    edibleFraction: d.edibleFraction,
    portions: d.portions,
  };
}
