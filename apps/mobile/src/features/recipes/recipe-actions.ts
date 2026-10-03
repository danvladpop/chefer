import { formatDate, sourceDomainOf } from '@chefer/utils';

// UX-REC-08 / UX-REC-13: the pure parts of the recipe page's ⋯ menu and the
// cookbook rows — the lines sent to the shopping list and a row's source/date
// line. No network here; the screen wires them to `shoppingList.addCustomItems`.

// Shopping-line helpers are shared with web (`@chefer/utils`, mobile parity).
export {
  chunkShoppingLines,
  SHOPPING_CHUNK,
  shoppingLinesFor,
  type ShoppingLine,
} from '@chefer/utils';

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
      ? formatDate(added, added.getFullYear() === now.getFullYear() ? 'short' : 'medium')
      : null;
  if (domain && addedText) return `From ${domain} · ${addedText}`;
  if (domain) return `From ${domain}`;
  return addedText ? `Added ${addedText}` : null;
}
