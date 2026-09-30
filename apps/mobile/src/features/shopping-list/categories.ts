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
