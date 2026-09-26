import type { MealType, RecipeData } from '../../lib/ai/types.js';

// ─── Cookbook → Discover (audit F-REC-1-4, P2-8) ──────────────────────────────
// The Recipes tab only listed recipes from the user's own past plans, so a
// new user saw an empty page. Discover browses the curated pool — the same
// hand-checked recipes free plans draw from — already filtered by the user's
// (and household's) allergies and restrictions, with simple filters. No AI.

export const DISCOVER_MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

export interface DiscoverFilters {
  mealType?: MealType | undefined;
  /** Case-insensitive match on name, cuisine, tags and ingredient names. */
  search?: string | undefined;
  /** Prep + cook time ceiling in minutes. */
  maxTotalMins?: number | undefined;
  limit?: number | undefined;
}

export interface DiscoverRecipeDto {
  id: string;
  name: string;
  description: string;
  imageUrl: string | null;
  /** Curated recipes ship with preset photos. */
  imageStatus: 'DONE';
  cuisineType: string;
  dietaryTags: string[];
  prepTimeMins: number;
  cookTimeMins: number;
  servings: number;
  nutritionInfo: { calories: number; protein: number; carbs: number; fat: number };
  mealType: MealType;
  isFavourite: boolean;
}

const DEFAULT_LIMIT = 60;

function matchesSearch(recipe: RecipeData, term: string): boolean {
  const haystack = [
    recipe.name,
    recipe.cuisineType,
    ...recipe.dietaryTags,
    ...recipe.ingredients.map((i) => i.name),
  ]
    .join(' ')
    .toLowerCase();
  return term
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

/**
 * Pure selection over the (already safety-filtered) curated pools: meal type,
 * search and time filters, one entry per recipe, in meal-of-the-day order.
 */
export function selectDiscoverRecipes(
  pools: Record<MealType, RecipeData[]>,
  filters: DiscoverFilters,
  savedIds: ReadonlySet<string> = new Set(),
): DiscoverRecipeDto[] {
  const types = filters.mealType ? [filters.mealType] : DISCOVER_MEAL_TYPES;
  const search = filters.search?.trim() ?? '';
  const seen = new Set<string>();
  const out: DiscoverRecipeDto[] = [];

  for (const mealType of types) {
    for (const recipe of pools[mealType]) {
      if (seen.has(recipe.id)) continue;
      if (search && !matchesSearch(recipe, search)) continue;
      if (
        filters.maxTotalMins !== undefined &&
        recipe.prepTimeMins + recipe.cookTimeMins > filters.maxTotalMins
      ) {
        continue;
      }
      seen.add(recipe.id);
      const n = recipe.nutritionInfo;
      out.push({
        id: recipe.id,
        name: recipe.name,
        description: recipe.description,
        imageUrl: recipe.imageUrl ?? null,
        imageStatus: 'DONE',
        cuisineType: recipe.cuisineType,
        dietaryTags: recipe.dietaryTags,
        prepTimeMins: recipe.prepTimeMins,
        cookTimeMins: recipe.cookTimeMins,
        servings: recipe.servings,
        nutritionInfo: {
          calories: n.calories,
          protein: n.protein,
          carbs: n.carbs,
          fat: n.fat,
        },
        mealType,
        isFavourite: savedIds.has(recipe.id),
      });
    }
  }
  return out.slice(0, filters.limit ?? DEFAULT_LIMIT);
}
