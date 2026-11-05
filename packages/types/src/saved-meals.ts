import { z } from 'zod';

// ─── Saved meals + copy meal (lane A2) ────────────────────────────────────────
// A saved meal is a named snapshot of one logged meal (several entries): their
// names and numbers, re-logged in one tap. Copying a meal moves one meal's
// entries to another day or meal. Both are free.

export const SAVED_MEAL_LIMITS = {
  nameMaxLength: 60,
  /** Saved meals per user. */
  maxPerUser: 50,
  /** Entries one saved meal can hold. */
  maxItems: 20,
} as const;

export const savedMealNameSchema = z
  .string()
  .trim()
  .min(1, 'Give the meal a name.')
  .max(SAVED_MEAL_LIMITS.nameMaxLength);

/** One entry of a saved meal, as it was logged. */
export interface SavedMealItem {
  /** A recipe entry re-logs as that recipe; anything else as a custom entry. */
  recipeId?: string;
  name: string;
  estimatedBy?: 'vision' | 'manual';
  portionMultiplier: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  unknownMacros?: ('protein' | 'carbs' | 'fat')[];
  product?: { id: string; grams: number };
}

export interface SavedMealView {
  id: string;
  name: string;
  items: SavedMealItem[];
  totals: { kcal: number; protein: number; carbs: number; fat: number };
  /** ISO time it was last logged, or null. */
  lastLoggedAt: string | null;
}

export const SAVED_MEALS_COPY = {
  groupTitle: 'Saved meals',
  actionsTitle: 'Save or copy a meal',
  saveAs: 'Save as a meal',
  copyTo: 'Copy to…',
  nothingLogged: 'Nothing logged for this meal yet.',
  sameTarget: 'Pick another day or meal to copy to.',
  duplicateName: 'You already have a saved meal with that name.',
  tooMany: `You can keep up to ${SAVED_MEAL_LIMITS.maxPerUser} saved meals. Delete one first.`,
} as const;
