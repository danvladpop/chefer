import { CATEGORY_ORDER } from '../../shopping-list/categories';

// The new shell's Shop list (10 Oct redesign, board "Shop"): aisles in the
// old order (CATEGORY_ORDER, shared with the share sheet) under plain names,
// ticked items sinking to the bottom of their aisle, and the one field that
// both searches and adds. Pure, so the ordering rules are unit-tested.

/** Aisle names on the new Shop (the API's category keys stay the same). */
export const SHOP_GROUP_LABELS: Readonly<Record<string, string>> = {
  produce: 'Fruit & veg',
  proteins: 'Meat & fish',
  dairy: 'Dairy & eggs',
  grains: 'Grains & pantry',
  frozen: 'Frozen',
  other: 'Other',
};

/**
 * Unticked items first, ticked ones last — each part in its original order
 * (a stable partition, so nothing else moves when an item is ticked).
 */
export function sortCheckedLast<T extends { key: string }>(
  items: readonly T[],
  checkedKeys: ReadonlySet<string>,
): T[] {
  const open: T[] = [];
  const done: T[] = [];
  for (const item of items) (checkedKeys.has(item.key) ? done : open).push(item);
  return [...open, ...done];
}

/** Whether an item's name matches what is typed in "Search or add an item" (case-insensitive). */
export function matchesItemSearch(name: string, query: string): boolean {
  const q = query.trim().toLocaleLowerCase();
  return q === '' || name.toLocaleLowerCase().includes(q);
}

export interface ShopGroup<T> {
  category: string;
  label: string;
  /** The rows to draw: matching the search, ticked ones last. */
  items: T[];
  /** The whole aisle's count and how many are still to buy (the header's "6 of 8 left"). */
  total: number;
  left: number;
}

/**
 * The list as aisles in CATEGORY_ORDER. An item with a category the app does
 * not know yet goes under Other rather than disappearing. A search hides the
 * aisles with no match.
 */
export function shopGroups<T extends { key: string; category: string; ingredientName: string }>(
  items: readonly T[],
  checkedKeys: readonly string[],
  query = '',
): ShopGroup<T>[] {
  const checked = new Set(checkedKeys);
  const known = new Set<string>(CATEGORY_ORDER);
  return CATEGORY_ORDER.map((category) => {
    const all = items.filter((i) =>
      category === 'other'
        ? i.category === 'other' || !known.has(i.category)
        : i.category === category,
    );
    const shown = all.filter((i) => matchesItemSearch(i.ingredientName, query));
    return {
      category,
      label: SHOP_GROUP_LABELS[category] ?? category,
      items: sortCheckedLast(shown, checked),
      total: all.length,
      left: all.filter((i) => !checked.has(i.key)).length,
    };
  }).filter((g) => g.items.length > 0);
}

/** "6 of 8 left" / "All done". */
export function shopGroupStatus(group: Pick<ShopGroup<unknown>, 'total' | 'left'>): string {
  return group.left === 0 ? 'All done' : `${group.left} of ${group.total} left`;
}
