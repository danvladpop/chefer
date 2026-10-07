import type { Ionicons } from '@expo/vector-icons';

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
  { icon: keyof typeof Ionicons.glyphMap; tile: string; color: string }
> = {
  produce: { icon: 'leaf-outline', tile: 'bg-emerald-50', color: '#047857' },
  proteins: { icon: 'restaurant-outline', tile: 'bg-rose-50', color: '#be123c' },
  dairy: { icon: 'water-outline', tile: 'bg-sky-50', color: '#0369a1' },
  grains: { icon: 'nutrition-outline', tile: 'bg-amber-50', color: '#b45309' },
  frozen: { icon: 'snow-outline', tile: 'bg-cyan-50', color: '#0e7490' },
  other: { icon: 'basket-outline', tile: 'bg-gray-100', color: '#4b5563' },
};

const FALLBACK_TILE = { icon: 'basket-outline', tile: 'bg-gray-100', color: '#4b5563' } as const;

export function categoryTile(category: string) {
  return CATEGORY_TILES[category] ?? FALLBACK_TILE;
}
