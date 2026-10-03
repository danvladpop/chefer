import type { RouterOutputs } from '../../lib/trpc';

// UX-SHOP-02: adding an item offline (or on a slow link) used to look like
// nothing happened, so people typed it again and got duplicates. The row goes
// into the list at once, marked as not yet saved, and the server's answer
// replaces it.

type ShopList = RouterOutputs['shoppingList']['getForWeek'];
export type ShopListItem = ShopList['items'][number];

export const PENDING_KEY_PREFIX = 'pending:';

export function isPendingItem(item: { key: string }): boolean {
  return item.key.startsWith(PENDING_KEY_PREFIX);
}

/** The optimistic row for an item the user just typed. */
export function pendingShopItem(
  input: { name: string; quantity?: number | undefined; unit?: string | undefined },
  nonce: string,
): ShopListItem {
  const name = input.name.trim();
  return {
    key: `${PENDING_KEY_PREFIX}${nonce}`,
    ingredientName: name.charAt(0).toUpperCase() + name.slice(1),
    quantity: String(input.quantity ?? 1),
    unit: input.unit ?? 'pcs',
    category: 'other',
    recipeNames: [],
    imageUrl: '',
    estimatedPriceEur: null,
    isCustom: true,
  };
}

/** The list with the user's new rows appended (the server re-sorts them into aisles on its answer). */
export function withPendingItems(
  list: ShopList,
  inputs: readonly { name: string; quantity?: number | undefined; unit?: string | undefined }[],
  nonce: string,
): ShopList {
  return {
    ...list,
    items: [
      ...list.items,
      ...inputs.map((input, index) => pendingShopItem(input, `${nonce}-${index}`)),
    ],
  };
}
