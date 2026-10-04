import { isUnscalableUnit } from './scaled-quantity';

// UX-REC-08: the pure part of "Add ingredients to the shopping list" — the
// lines sent to `shoppingList.addCustomItems` for a recipe cooked at some
// number of servings. Shared by the phone's recipe ⋯ menu and the web recipe
// page. No network here.

/** What `shoppingList.addCustomItems` accepts per call (the API caps it at 20). */
export const SHOPPING_CHUNK = 20;

export type ShoppingLine = {
  name: string;
  quantity?: number;
  unit: string;
};

/**
 * The recipe's ingredients as shopping lines for `servings` cooked (the
 * recipe's own servings is the 1× base). "To taste" lines carry no amount;
 * an amount is rounded to 2 decimals and kept inside the API's 0–999 range.
 */
export function shoppingLinesFor(
  ingredients: readonly { name: string; quantity: number; unit: string }[],
  servings: number,
  baseServings: number,
): ShoppingLine[] {
  const scale = servings / Math.max(1, baseServings);
  return ingredients.flatMap((ing) => {
    const name = ing.name.trim().slice(0, 80);
    if (!name) return [];
    const unit = ing.unit.trim().slice(0, 20);
    if (isUnscalableUnit(ing.unit)) return [{ name, unit: unit || 'to taste' }];
    const scaled = Math.round(ing.quantity * scale * 100) / 100;
    const quantity = Math.min(999, Math.max(0.01, scaled));
    return [{ name, quantity, unit: unit || 'pcs' }];
  });
}

/** Splits lines into API-sized batches. */
export function chunkShoppingLines(lines: readonly ShoppingLine[]): ShoppingLine[][] {
  const chunks: ShoppingLine[][] = [];
  for (let i = 0; i < lines.length; i += SHOPPING_CHUNK) {
    chunks.push(lines.slice(i, i + SHOPPING_CHUNK));
  }
  return chunks;
}
