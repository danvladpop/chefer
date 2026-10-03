import { isUnscalableUnit, sourceDomainOf } from '@chefer/utils';

// UX-REC-08 / UX-REC-13: the pure parts of the recipe page's ⋯ menu and the
// cookbook rows — the lines sent to the shopping list and a row's source/date
// line. No network here; the screen wires them to `shoppingList.addCustomItems`.

/** What `shoppingList.addCustomItems` accepts per call (the API caps it at 20). */
export const SHOPPING_CHUNK = 20;

export interface ShoppingLine {
  name: string;
  quantity?: number;
  unit: string;
}

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

/**
 * UX-REC-13: the line under a cookbook row that tells two look-alike recipes
 * apart — "Imported from {domain}" when there is a source, else "Added 3 Oct"
 * (with the year when it isn't this one). Null when neither is known
 * (Discover rows).
 */
export function recipeCardMeta(
  recipe: { createdAt?: Date | string | undefined; sourceUrl?: string | null | undefined },
  now: Date = new Date(),
): string | null {
  const domain = sourceDomainOf(recipe.sourceUrl ?? null);
  const added = recipe.createdAt ? new Date(recipe.createdAt) : null;
  const addedText =
    added && !Number.isNaN(added.getTime())
      ? added.toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'short',
          ...(added.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
        })
      : null;
  if (domain && addedText) return `From ${domain} · ${addedText}`;
  if (domain) return `From ${domain}`;
  return addedText ? `Added ${addedText}` : null;
}
