import {
  formatScaledQuantity,
  isUnscalableUnit,
  sourceDomainOf,
  type UnitSystem,
} from '@chefer/utils';

// UX-REC-04 / UX-REC-08: the pure parts of the recipe page's ⋯ menu — the
// plain-text body handed to the native Share sheet, and the lines sent to the
// shopping list. No network here; the screen wires them to RN `Share` and
// `shoppingList.addCustomItems`.

export interface ActionRecipe {
  name: string;
  description?: string | undefined;
  servings: number;
  sourceUrl?: string | undefined;
  ingredients: readonly { name: string; quantity: number; unit: string }[];
  instructions: readonly string[];
}

/** The text the native Share sheet receives: name, ingredients, steps, source. */
export function recipeShareText(recipe: ActionRecipe, unitSystem: UnitSystem): string {
  const lines: string[] = [recipe.name];
  const description = recipe.description?.trim();
  if (description) lines.push('', description);
  lines.push('', `Ingredients (${recipe.servings} serving${recipe.servings === 1 ? '' : 's'})`);
  for (const ing of recipe.ingredients) {
    lines.push(`- ${formatScaledQuantity(ing.quantity, ing.unit, 1, unitSystem)} ${ing.name}`);
  }
  if (recipe.instructions.length > 0) {
    lines.push('', 'Steps');
    recipe.instructions.forEach((step, i) => lines.push(`${i + 1}. ${step}`));
  }
  if (recipe.sourceUrl) lines.push('', `Source: ${recipe.sourceUrl}`);
  lines.push('', 'Shared from Chefer');
  return lines.join('\n');
}

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
