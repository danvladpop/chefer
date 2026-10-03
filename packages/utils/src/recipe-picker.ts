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

// ─── Slot ranking (UX-PLAN-05) ─────────────────────────────────────────────────
// The Lunch picker led with breakfasts: the list is newest-first and knows
// nothing about the slot. A recipe's meal type is only KNOWN for curated
// recipes (`mealType` on the row); everything else is guessed from its name.
// Guesses only ever re-order — they never hide a row.

export type SlotMealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

const NAME_HINTS: Record<SlotMealType, RegExp> = {
  breakfast:
    /\b(oat|oats|oatmeal|porridge|omelet|omelette|pancakes?|waffles?|granola|muesli|parfait|french toast|avocado toast|scrambled|bagel|shakshuka|frittata)\b/i,
  snack:
    /\b(snack|energy balls?|trail mix|hummus|bites?|nuts|crackers|popcorn|protein bar|smoothie|dip)\b/i,
  lunch: /\b(salad|wrap|sandwich|bowl|soup|burrito|pita)\b/i,
  dinner:
    /\b(curry|stir[- ]fry|roast|roasted|stew|pasta|steak|casserole|lasagna|salmon|risotto)\b/i,
};

const HINT_ORDER: SlotMealType[] = ['breakfast', 'snack', 'lunch', 'dinner'];

/** A best-effort meal type from a recipe's name, or null when nothing in it says. */
export function inferMealTypeFromName(name: string): SlotMealType | null {
  return HINT_ORDER.find((type) => NAME_HINTS[type].test(name)) ?? null;
}

/** 0 = fits the slot, 1 = unknown, 2 = a different meal. */
export function slotFitRank(
  hint: string | null | undefined,
  slotType: string | null | undefined,
): 0 | 1 | 2 {
  if (!slotType || !hint) return 1;
  return hint === slotType ? 0 : 2;
}

/**
 * Stable re-order for a slot: recipes that fit it first, unknowns next, other
 * meals last. `hintOf` returns the known/guessed type of a row.
 */
export function rankForSlot<T>(
  rows: readonly T[],
  slotType: string | null | undefined,
  hintOf: (row: T) => string | null | undefined,
): T[] {
  if (!slotType) return [...rows];
  return rows
    .map((row, index) => ({ row, index, rank: slotFitRank(hintOf(row), slotType) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ row }) => row);
}

/** Known `mealType` first, else the name guess. */
export function recipeMealTypeHint(recipe: {
  name: string;
  mealType?: string | null | undefined;
}): string | null {
  return recipe.mealType ?? inferMealTypeFromName(recipe.name);
}

// ─── Row content (UX-PLAN-05) ──────────────────────────────────────────────────

/** "420 kcal · 32 g protein · 25 min" — whatever of it the recipe has. */
export function pickerRowMeta(recipe: {
  nutritionInfo?: { calories?: number | null; protein?: number | null } | null;
  prepTimeMins?: number | null;
  cookTimeMins?: number | null;
}): string {
  const parts: string[] = [];
  const kcal = recipe.nutritionInfo?.calories;
  if (typeof kcal === 'number') parts.push(`${Math.round(kcal)} kcal`);
  const protein = recipe.nutritionInfo?.protein;
  if (typeof protein === 'number' && protein > 0) parts.push(`${Math.round(protein)} g protein`);
  const mins = (recipe.prepTimeMins ?? 0) + (recipe.cookTimeMins ?? 0);
  if (mins > 0) parts.push(`${mins} min`);
  return parts.join(' · ');
}

/**
 * The safety check a picker's rows share, said ONCE in the header instead of
 * as an identical pill on every row (which cost each row a third of its
 * width). `labels` are the rules every checked row passed; `partialIds` are
 * rows that passed fewer — only those keep a chip of their own.
 */
export function pickerSafetyHeader(rows: readonly { id: string; verified: readonly string[] }[]): {
  labels: string[];
  partialIds: Set<string>;
} {
  const union = [...new Set(rows.flatMap((r) => r.verified))];
  const partialIds = new Set<string>();
  for (const row of rows) {
    if (row.verified.length > 0 && row.verified.length < union.length) partialIds.add(row.id);
  }
  return { labels: union, partialIds };
}

/** "Every suggestion checked for peanuts and vegan" — null when nothing was checked. */
export function pickerSafetyHeaderText(labels: readonly string[]): string | null {
  if (labels.length === 0) return null;
  const list =
    labels.length === 1
      ? labels[0]
      : `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
  return `Suggestions checked for ${list}`;
}

export function buildPickerSections<
  T extends {
    id: string;
    name?: string | undefined;
    mealType?: string | null | undefined;
    isFavourite?: boolean | undefined;
  },
>(mine: T[] | undefined, all: T[] | undefined, slotType?: string): PickerSection<T>[] {
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

  const hintOf = (r: T) => recipeMealTypeHint({ name: r.name ?? '', mealType: r.mealType });
  const sections: PickerSection<T>[] = [];
  if (yours.length > 0) {
    sections.push({ title: 'Your recipes', data: rankForSlot(yours, slotType, hintOf) });
  }
  if (rest.length > 0) {
    sections.push({ title: 'All recipes', data: rankForSlot(rest, slotType, hintOf) });
  }
  return sections;
}
