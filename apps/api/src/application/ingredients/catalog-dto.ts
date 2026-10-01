import type { CatalogIngredientRow, IngredientCategory, NutritionSource } from '@chefer/database';

// ─── Catalog row → client reference (plan-ingredient-catalog §9) ──────────────
// The compact shape search, resolve and import review return for a row.

/** A catalog row as search/resolve return it (plan §9). */
export interface CatalogIngredientRef {
  id: string;
  slug: string;
  /** Display name ("Chicken breast, raw"). */
  name: string;
  category: IngredientCategory;
  owner: 'global' | 'mine';
  portions: { unit: string; grams: number }[];
  hasDensity: boolean;
  nutritionSource: NutritionSource;
}

/** `owner` is relative to `userId`: 'mine' only for the caller's own private row. */
export function toRef(row: CatalogIngredientRow, userId: string | null): CatalogIngredientRef {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: row.category,
    owner: row.ownerId !== null && row.ownerId === userId ? 'mine' : 'global',
    portions: row.portions.map((p) => ({ unit: p.unit, grams: p.grams })),
    hasDensity: row.densityGPerMl != null,
    nutritionSource: row.nutritionSource,
  };
}
