import { formatKcal } from './format';

// ─── "Ate something else": the eating-out quick estimate (WP-06, Food 1) ──────
// Rule-based, no AI, free. The user picks a cuisine and a size; we answer with
// a RANGE (never a single false-precise number) for kcal and protein.
//
// Where the numbers come from: hand-set assumptions for restaurant and takeaway
// portions (not home cooking), chosen to sit inside the ranges that published
// sources give for these dishes — USDA FoodData Central restaurant and
// fast-food entries, UK out-of-home calorie-labelling data — and, for the
// Romanian lunch menu ("meniul zilei"), the usual composition: ciorbă or soup,
// a main and bread, optionally dessert. Nothing here was measured. Restaurant
// food runs heavier than it looks (oil, sauces, bread), so every bound is
// ROUNDED UP — kcal to the next 50, protein to the next 5 g. Carbs and fat are
// deliberately not estimated (callers log them as unknown macros).

export const EAT_OUT_CUISINES = [
  'shawarma',
  'pizza',
  'burger',
  'sushi',
  'salad',
  'romanian_menu',
  'pasta',
  'asian',
] as const;
export type EatOutCuisine = (typeof EAT_OUT_CUISINES)[number];

export const EAT_OUT_SIZES = ['light', 'normal', 'big'] as const;
export type EatOutSize = (typeof EAT_OUT_SIZES)[number];

export const EAT_OUT_CUISINE_LABELS: Record<EatOutCuisine, string> = {
  shawarma: 'Shawarma',
  pizza: 'Pizza',
  burger: 'Burger',
  sushi: 'Sushi',
  salad: 'Salad',
  romanian_menu: 'Romanian lunch menu',
  pasta: 'Pasta',
  asian: 'Asian',
};

export const EAT_OUT_SIZE_LABELS: Record<EatOutSize, string> = {
  light: 'Light',
  normal: 'Normal',
  big: 'Big',
};

/** What a size means for each cuisine, for the picker's helper text. */
export const EAT_OUT_SIZE_HINTS: Record<EatOutCuisine, Record<EatOutSize, string>> = {
  shawarma: { light: 'Small wrap', normal: 'Regular wrap', big: 'Large wrap or plate' },
  pizza: { light: '2 slices', normal: '3–4 slices', big: 'A whole personal pizza' },
  burger: { light: 'Burger, no fries', normal: 'Burger and fries', big: 'Double burger and fries' },
  sushi: { light: '6 pieces', normal: '8–10 pieces', big: 'A large platter' },
  salad: { light: 'Side or small salad', normal: 'Main salad', big: 'Large salad with extras' },
  romanian_menu: {
    light: 'Soup and a small main',
    normal: 'Soup, main and bread',
    big: 'Soup, main, bread and dessert',
  },
  pasta: { light: 'Small plate', normal: 'Regular plate', big: 'Large plate' },
  asian: { light: 'Small bowl', normal: 'Regular bowl or plate', big: 'Large bowl, with a side' },
};

export interface EatOutRange {
  min: number;
  max: number;
}

export interface EatOutEstimate {
  kcal: EatOutRange;
  protein: EatOutRange;
}

/** Raw (unrounded) ranges per cuisine and size: [kcal min, kcal max, protein min, protein max]. */
const RAW: Record<EatOutCuisine, Record<EatOutSize, readonly [number, number, number, number]>> = {
  shawarma: {
    light: [520, 640, 26, 33],
    normal: [680, 830, 33, 43],
    big: [880, 1080, 43, 54],
  },
  pizza: {
    light: [480, 590, 19, 25],
    normal: [680, 880, 27, 35],
    big: [980, 1280, 38, 49],
  },
  burger: {
    light: [480, 640, 24, 31],
    normal: [830, 1030, 31, 39],
    big: [1180, 1430, 44, 58],
  },
  sushi: {
    light: [280, 380, 12, 19],
    normal: [430, 580, 19, 27],
    big: [680, 830, 29, 39],
  },
  salad: {
    light: [280, 380, 13, 21],
    normal: [430, 580, 24, 31],
    big: [630, 780, 31, 41],
  },
  romanian_menu: {
    light: [580, 730, 24, 31],
    normal: [830, 980, 33, 43],
    big: [1080, 1330, 38, 53],
  },
  pasta: {
    light: [480, 580, 14, 21],
    normal: [680, 830, 21, 29],
    big: [930, 1130, 28, 39],
  },
  asian: {
    light: [430, 580, 17, 24],
    normal: [680, 830, 24, 33],
    big: [930, 1130, 33, 44],
  },
};

const ceilTo = (value: number, step: number): number => Math.ceil(value / step) * step;

function build([kcalMin, kcalMax, proteinMin, proteinMax]: readonly [
  number,
  number,
  number,
  number,
]): EatOutEstimate {
  return {
    kcal: { min: ceilTo(kcalMin, 50), max: ceilTo(kcalMax, 50) },
    protein: { min: ceilTo(proteinMin, 5), max: ceilTo(proteinMax, 5) },
  };
}

/** The table: kcal and protein ranges, rounded UP (restaurant food), per cuisine and size. */
export const eatOutEstimates: Record<
  EatOutCuisine,
  Record<EatOutSize, EatOutEstimate>
> = Object.fromEntries(
  EAT_OUT_CUISINES.map((cuisine) => [
    cuisine,
    Object.fromEntries(EAT_OUT_SIZES.map((size) => [size, build(RAW[cuisine][size])])),
  ]),
) as Record<EatOutCuisine, Record<EatOutSize, EatOutEstimate>>;

export function eatOutEstimate(cuisine: EatOutCuisine, size: EatOutSize): EatOutEstimate {
  return eatOutEstimates[cuisine][size];
}

/** "≈ 700–850 kcal" — the headline, always a range (thousands grouped by the locale). */
export function formatEatOutKcal(estimate: EatOutEstimate, locale?: string): string {
  return `≈ ${formatKcal(estimate.kcal.min, locale)}–${formatKcal(estimate.kcal.max, locale)} kcal`;
}

/** "≈ 35–45 g protein". */
export function formatEatOutProtein(estimate: EatOutEstimate): string {
  return `≈ ${estimate.protein.min}–${estimate.protein.max} g protein`;
}

/** The entry's name: "Shawarma · normal". */
export function eatOutMealName(cuisine: EatOutCuisine, size: EatOutSize): string {
  return `${EAT_OUT_CUISINE_LABELS[cuisine]} · ${size}`;
}

/**
 * The single numbers to LOG for an estimate (`logCustomMeal` takes one kcal and
 * one protein): the middle of the already rounded-up range. Carbs and fat are
 * unknown — log with `unknownMacros: ['carbs', 'fat']` and 0 g.
 */
export function eatOutLogValues(estimate: EatOutEstimate): { kcal: number; protein: number } {
  return {
    kcal: Math.round((estimate.kcal.min + estimate.kcal.max) / 2),
    protein: Math.round((estimate.protein.min + estimate.protein.max) / 2),
  };
}
