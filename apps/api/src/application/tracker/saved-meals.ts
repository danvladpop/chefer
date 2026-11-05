import { z } from 'zod';
import type { LoggedMealEntry } from '@chefer/database';
import type { SavedMealItem } from '@chefer/types';
import { newEntryId } from './merge-log.js';

// ─── Saved meals + copy meal (lane A2): entry ↔ item mapping ──────────────────
// Pure, so the snapshot rules are testable without a database.

const savedMealItemSchema = z.object({
  recipeId: z.string().min(1).optional(),
  name: z.string().min(1),
  estimatedBy: z.enum(['vision', 'manual']).optional(),
  portionMultiplier: z.number().finite().positive(),
  kcal: z.number().finite().min(0),
  protein: z.number().finite().min(0),
  carbs: z.number().finite().min(0),
  fat: z.number().finite().min(0),
  unknownMacros: z.array(z.enum(['protein', 'carbs', 'fat'])).optional(),
  product: z.object({ id: z.string(), grams: z.number() }).optional(),
});

/** The stored JSON → items; a malformed item is dropped rather than crashing the list. */
export function parseSavedMealItems(json: unknown): SavedMealItem[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((raw) => {
    const parsed = savedMealItemSchema.safeParse(raw);
    return parsed.success ? [parsed.data as SavedMealItem] : [];
  });
}

/** The entries one meal of a day holds: everything logged with that meal type. */
export function entriesOfMeal(entries: LoggedMealEntry[], mealType: string): LoggedMealEntry[] {
  return entries.filter((m) => m.mealType === mealType);
}

/** Entries → a saved-meal snapshot. Recipe entries keep their recipe; the name is the recipe's. */
export function toSavedMealItems(
  entries: LoggedMealEntry[],
  recipeNames: ReadonlyMap<string, string>,
): SavedMealItem[] {
  return entries.map((m) => ({
    ...(m.recipeId && !m.custom ? { recipeId: m.recipeId } : {}),
    name: m.custom?.name ?? (m.recipeId ? recipeNames.get(m.recipeId) : undefined) ?? 'Logged meal',
    ...(m.custom && { estimatedBy: m.custom.estimatedBy }),
    portionMultiplier: m.portionMultiplier,
    kcal: m.kcal,
    protein: m.protein,
    carbs: m.carbs,
    fat: m.fat,
    ...(m.unknownMacros && m.unknownMacros.length > 0 && { unknownMacros: m.unknownMacros }),
    ...(m.product && { product: m.product }),
  }));
}

/** A saved meal → fresh entries for `mealType` (new ids, no plan slot). */
export function entriesFromSavedMeal(items: SavedMealItem[], mealType: string): LoggedMealEntry[] {
  return items.map((item) => ({
    entryId: newEntryId(),
    ...(item.recipeId
      ? { recipeId: item.recipeId }
      : { custom: { name: item.name, estimatedBy: item.estimatedBy ?? 'manual' } }),
    mealType,
    portionMultiplier: item.portionMultiplier,
    kcal: item.kcal,
    protein: item.protein,
    carbs: item.carbs,
    fat: item.fat,
    ...(item.unknownMacros && { unknownMacros: item.unknownMacros }),
    ...(item.product && { product: item.product }),
  }));
}

/**
 * One meal's entries copied to another meal type (copyDay's rule, narrowed):
 * fresh ids so Undo deletes only the copies, and no plan slot — the target
 * day's slots are a different plan.
 */
export function copiedMealEntries(
  entries: LoggedMealEntry[],
  toMealType: string,
): LoggedMealEntry[] {
  return entries.map((m) => {
    const { slotIndex: _slotIndex, entryId: _entryId, replacesSlot: _replacesSlot, ...rest } = m;
    return { ...rest, mealType: toMealType, entryId: newEntryId() };
  });
}
