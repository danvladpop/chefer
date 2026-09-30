import {
  formatListForSharing,
  shareableItems,
  shareListSubtitle,
  shareListTitle,
  type ShareDinner,
  type ShareListItem,
  type ShareListScope,
  type UnitSystem,
} from '@chefer/utils';
import { CATEGORY_LABELS, CATEGORY_ORDER } from './categories';

// T-13.2 — the glue between the Shop screen's data and the shared
// `formatListForSharing`: items mapped in the screen's aisle order, the
// title/subtitle, the units. Pure and tested; the sheet only calls it.

export interface ShopItemLike {
  key: string;
  ingredientName: string;
  category: string;
  quantity: number | string;
  unit: string;
  pantryCovered?: boolean | undefined;
  isCustom?: boolean | undefined;
}

/** The list's items as ShareListItems, in the screen's aisle order then item order. */
export function toShareItems(
  items: readonly ShopItemLike[],
  checkedKeys: readonly string[],
): ShareListItem[] {
  const known: readonly string[] = CATEGORY_ORDER;
  const aisleOf = (i: ShopItemLike) => (known.includes(i.category) ? i.category : 'other');
  return CATEGORY_ORDER.flatMap((aisle) =>
    items
      .filter((i) => aisleOf(i) === aisle)
      .map(
        (i): ShareListItem => ({
          aisle,
          name: i.ingredientName,
          quantity: i.quantity,
          unit: i.unit,
          checked: checkedKeys.includes(i.key),
          haveIt: i.pantryCovered === true,
          isCustom: i.isCustom === true,
        }),
      ),
  );
}

/** How many lines each scope would send: the sheet's `· n items`. */
export function shareCounts(shareItems: readonly ShareListItem[]): {
  everything: number;
  whatsLeft: number;
} {
  return {
    everything: shareableItems(shareItems, 'everything').length,
    whatsLeft: shareableItems(shareItems, 'whatsLeft').length,
  };
}

export function buildShopShareText(input: {
  items: readonly ShopItemLike[];
  checkedKeys: readonly string[];
  weekStart: Date;
  fromDayOfWeek?: number | null | undefined;
  portions?: number | null | undefined;
  scope: ShareListScope;
  withAmounts: boolean;
  withDinners: boolean;
  dinners: readonly ShareDinner[];
  unitSystem: UnitSystem;
  shareUrl?: string | undefined;
}): string {
  const subtitle = shareListSubtitle({
    dinnersCount: input.dinners.length,
    portions: input.portions ?? null,
  });
  return formatListForSharing(
    toShareItems(input.items, input.checkedKeys),
    {
      scope: input.scope,
      withAmounts: input.withAmounts,
      units: input.unitSystem === 'IMPERIAL' ? 'imperial' : 'metric',
      withDinners: input.withDinners,
      dinners: input.dinners,
      title: shareListTitle({ weekStart: input.weekStart, fromDayOfWeek: input.fromDayOfWeek }),
      ...(subtitle && { subtitle }),
      aisleLabels: CATEGORY_LABELS,
    },
    input.shareUrl,
  );
}
