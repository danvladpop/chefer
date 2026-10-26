import type { FoodTextLogItem, ParsedFoodItem } from '@chefer/types';
import { formatNumber } from './format';
import { QUICK_ADD_LIMITS } from './quick-add';

// ─── Typed "I ate…" logging (lane A4) ─────────────────────────────────────────
// The review list's arithmetic: an item at the amount the user settled on →
// the entry that gets logged. Shared so both apps log the same numbers.

const round1 = (n: number) => Math.round(n * 10) / 10;

/** The amount shown and edited for an item: grams or servings. */
export function parsedItemAmount(item: ParsedFoodItem): number {
  return item.unit === 'g' ? item.grams : item.servings;
}

/** An item at `amount` (grams or servings) → the entry to log. Null for a non-positive amount. */
export function parsedItemToLogItem(item: ParsedFoodItem, amount: number): FoodTextLogItem | null {
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const estimatedBy = item.source === 'estimate' ? 'vision' : 'manual';
  if (item.unit === 'serving') {
    const n = item.perServing;
    return {
      name:
        amount === 1
          ? item.name
          : `${item.name} ×${formatNumber(amount, { maximumFractionDigits: 1 })}`,
      estimatedBy,
      kcal: Math.min(QUICK_ADD_LIMITS.kcal, Math.round(n.kcal * amount)),
      protein: Math.min(QUICK_ADD_LIMITS.protein, round1(n.protein * amount)),
      carbs: Math.min(QUICK_ADD_LIMITS.carbs, round1(n.carbs * amount)),
      fat: Math.min(QUICK_ADD_LIMITS.fat, round1(n.fat * amount)),
    };
  }
  const factor = amount / 100;
  const unknownMacros: ('protein' | 'carbs' | 'fat')[] = [];
  const macro = (key: 'protein' | 'carbs' | 'fat', max: number): number => {
    const v = item.per100g[key];
    if (v === null) {
      unknownMacros.push(key);
      return 0;
    }
    return Math.min(max, round1(v * factor));
  };
  return {
    name: `${item.name}, ${formatNumber(amount, { maximumFractionDigits: 1 })} g`,
    estimatedBy,
    kcal: Math.min(QUICK_ADD_LIMITS.kcal, Math.round(item.per100g.kcal * factor)),
    protein: macro('protein', QUICK_ADD_LIMITS.protein),
    carbs: macro('carbs', QUICK_ADD_LIMITS.carbs),
    fat: macro('fat', QUICK_ADD_LIMITS.fat),
    ...(unknownMacros.length > 0 && { unknownMacros }),
    ...(item.productId && { product: { id: item.productId, grams: amount } }),
  };
}

/** The review list's total. */
export function foodTextTotal(items: readonly (FoodTextLogItem | null)[]): number {
  return items.reduce((sum, i) => sum + (i?.kcal ?? 0), 0);
}
