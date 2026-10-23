import type { Ionicons } from '@expo/vector-icons';
import type { ColorRole } from '@chefer/tokens';

// Shop aisles: display order and labels, shared by the list screen and the
// share sheet so a shared list reads in the same order as the screen.

export const CATEGORY_ORDER = [
  'produce',
  'proteins',
  'dairy',
  'grains',
  'frozen',
  'other',
] as const;

export const CATEGORY_LABELS: Record<string, string> = {
  produce: 'Produce',
  proteins: 'Proteins',
  dairy: 'Dairy & Eggs',
  grains: 'Grains & Pantry',
  frozen: 'Frozen',
  other: 'Other',
};

/**
 * FB7-10: what a row's thumbnail shows when the ingredient has no picture (or
 * it fails to load): the aisle's icon on a tinted tile — never a blank box.
 */
export const CATEGORY_TILES: Record<
  string,
  { icon: keyof typeof Ionicons.glyphMap; tile: string; color: ColorRole }
> = {
  produce: { icon: 'leaf-outline', tile: 'bg-positive/10', color: 'positive' },
  proteins: { icon: 'restaurant-outline', tile: 'bg-brand/10', color: 'brand' },
  dairy: { icon: 'water-outline', tile: 'bg-info/10', color: 'info' },
  grains: { icon: 'nutrition-outline', tile: 'bg-attention/10', color: 'attention' },
  frozen: { icon: 'snow-outline', tile: 'bg-info/10', color: 'info' },
  other: { icon: 'basket-outline', tile: 'bg-surface-sunken', color: 'labelSecondary' },
};

const FALLBACK_TILE = {
  icon: 'basket-outline',
  tile: 'bg-surface-sunken',
  color: 'labelSecondary',
} as const;

export function categoryTile(category: string) {
  return CATEGORY_TILES[category] ?? FALLBACK_TILE;
}
