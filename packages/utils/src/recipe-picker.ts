// Section builder for the replace-recipe picker sheet: the user's own
// recipes (created + favourited) surface above the general catalog.
export interface PickerSection<T> {
  title: string;
  data: T[];
}

// ─── Replace candidates (T-08.10, bug B-50) ────────────────────────────────────
// Shared by the mobile and web Replace pickers and re-exported by the API's
// `application/recipe/recipe-access.ts` — one implementation everywhere.
export interface ReplaceCandidateLike {
  id: string;
  mealType?: string | null | undefined;
}

export interface FilterReplaceCandidatesOptions {
  /** Narrows to recipes tagged for this slot; rows without `mealType` pass. */
  slotType?: string;
  /** The recipe currently in the slot — never offered as its own replacement. */
  excludeRecipeId?: string;
}

/** Dedupes by id, drops `excludeRecipeId`, and filters by `slotType` (rows without `mealType` pass). */
export function filterReplaceCandidates<T extends ReplaceCandidateLike>(
  candidates: readonly T[],
  opts: FilterReplaceCandidatesOptions = {},
): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const candidate of candidates) {
    if (opts.excludeRecipeId && candidate.id === opts.excludeRecipeId) continue;
    if (seen.has(candidate.id)) continue;
    if (opts.slotType && candidate.mealType != null && candidate.mealType !== opts.slotType) {
      continue;
    }
    seen.add(candidate.id);
    result.push(candidate);
  }
  return result;
}

export function buildPickerSections<T extends { id: string; isFavourite?: boolean }>(
  mine: T[] | undefined,
  all: T[] | undefined,
): PickerSection<T>[] {
  const seen = new Set<string>();
  const yours: T[] = [];
  for (const recipe of mine ?? []) {
    if (!seen.has(recipe.id)) {
      seen.add(recipe.id);
      yours.push(recipe);
    }
  }
  for (const recipe of all ?? []) {
    if (recipe.isFavourite && !seen.has(recipe.id)) {
      seen.add(recipe.id);
      yours.push(recipe);
    }
  }
  const rest = (all ?? []).filter((recipe) => !seen.has(recipe.id));

  const sections: PickerSection<T>[] = [];
  if (yours.length > 0) {
    sections.push({ title: 'Your recipes', data: yours });
  }
  if (rest.length > 0) {
    sections.push({ title: 'All recipes', data: rest });
  }
  return sections;
}
