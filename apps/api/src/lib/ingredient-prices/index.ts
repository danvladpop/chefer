import type { IngredientPrice } from '@chefer/database';

// ─── Ingredient price vocabulary — unit conversion & estimation ───────────────
// Baseline, store-agnostic prices live in the IngredientPrice table
// (per 100 g / per 100 ml / per piece). This module converts a recipe
// quantity+unit into the matching base family and computes an estimated
// price for the line item.

type UnitFamily = 'mass' | 'volume' | 'count';

interface NormalizedUnit {
  family: UnitFamily;
  /** Multiplier converting one recipe unit into the base unit (100 g / 100 ml / 1 piece). */
  toBase: number;
}

// Recipe units observed across the AI outputs and fixtures. Unknown units fall
// back to `count` with factor 1 — a rough but honest guess ("2 handfuls" ≈ 2 pieces).
const UNIT_TABLE: Record<string, NormalizedUnit> = {
  // Mass → base 100 g
  g: { family: 'mass', toBase: 1 / 100 },
  gram: { family: 'mass', toBase: 1 / 100 },
  grams: { family: 'mass', toBase: 1 / 100 },
  kg: { family: 'mass', toBase: 10 },
  oz: { family: 'mass', toBase: 28.35 / 100 },
  lb: { family: 'mass', toBase: 453.6 / 100 },
  // Volume → base 100 ml
  ml: { family: 'volume', toBase: 1 / 100 },
  l: { family: 'volume', toBase: 10 },
  litre: { family: 'volume', toBase: 10 },
  liter: { family: 'volume', toBase: 10 },
  tsp: { family: 'volume', toBase: 5 / 100 },
  teaspoon: { family: 'volume', toBase: 5 / 100 },
  tbsp: { family: 'volume', toBase: 15 / 100 },
  tablespoon: { family: 'volume', toBase: 15 / 100 },
  cup: { family: 'volume', toBase: 240 / 100 },
  cups: { family: 'volume', toBase: 240 / 100 },
  // Count → base 1 piece
  piece: { family: 'count', toBase: 1 },
  pieces: { family: 'count', toBase: 1 },
  pc: { family: 'count', toBase: 1 },
  small: { family: 'count', toBase: 0.75 },
  medium: { family: 'count', toBase: 1 },
  large: { family: 'count', toBase: 1.25 },
  whole: { family: 'count', toBase: 1 },
  clove: { family: 'count', toBase: 0.15 }, // ~1/7 of a garlic bulb
  cloves: { family: 'count', toBase: 0.15 },
  slice: { family: 'count', toBase: 0.15 }, // ~1/7 of a loaf/pack
  slices: { family: 'count', toBase: 0.15 },
  can: { family: 'count', toBase: 1.5 }, // cans cost more than "a piece"
  cans: { family: 'count', toBase: 1.5 },
  bunch: { family: 'count', toBase: 1 },
  handful: { family: 'count', toBase: 0.5 },
  pinch: { family: 'count', toBase: 0.05 },
  'to taste': { family: 'count', toBase: 0.05 },
  sprig: { family: 'count', toBase: 0.1 },
  sprigs: { family: 'count', toBase: 0.1 },
  stalk: { family: 'count', toBase: 0.3 },
  stalks: { family: 'count', toBase: 0.3 },
};

function normalizeUnit(unit: string): NormalizedUnit {
  const key = unit.toLowerCase().trim();
  return UNIT_TABLE[key] ?? { family: 'count', toBase: 1 };
}

/** Canonical unit options for recipe forms — keep in sync with UNIT_TABLE keys. */
export const RECIPE_UNITS = [
  'g',
  'kg',
  'ml',
  'l',
  'tsp',
  'tbsp',
  'cup',
  'piece',
  'small',
  'medium',
  'large',
  'clove',
  'slice',
  'can',
  'bunch',
  'pinch',
] as const;

export function normalizeIngredientName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Estimates the EUR price of `quantity unit` of an ingredient from its
 * vocabulary row. Falls back across families when the preferred one has no
 * price (e.g. a count-unit recipe line for an ingredient priced per 100 g
 * assumes ~150 g per piece). Returns null when no estimate is possible.
 */
export function estimateItemPriceEur(
  price: Pick<IngredientPrice, 'pricePer100gEur' | 'pricePer100mlEur' | 'pricePerPieceEur'>,
  quantity: number,
  unit: string,
): number | null {
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  const { family, toBase } = normalizeUnit(unit);
  const baseQty = quantity * toBase;

  const round = (v: number) => Math.round(v * 100) / 100;

  if (family === 'mass') {
    if (price.pricePer100gEur != null) return round(baseQty * price.pricePer100gEur);
    // ~150 g per piece as a generic fallback
    if (price.pricePerPieceEur != null) return round((baseQty / 1.5) * price.pricePerPieceEur);
    if (price.pricePer100mlEur != null) return round(baseQty * price.pricePer100mlEur);
    return null;
  }
  if (family === 'volume') {
    if (price.pricePer100mlEur != null) return round(baseQty * price.pricePer100mlEur);
    if (price.pricePer100gEur != null) return round(baseQty * price.pricePer100gEur);
    return null;
  }
  // count
  if (price.pricePerPieceEur != null) return round(baseQty * price.pricePerPieceEur);
  if (price.pricePer100gEur != null) return round(baseQty * 1.5 * price.pricePer100gEur);
  if (price.pricePer100mlEur != null) return round(baseQty * 1.5 * price.pricePer100mlEur);
  return null;
}

// ─── Nutrition computation ────────────────────────────────────────────────────

/** Assumed grams per piece when the catalog row has no gramsPerPiece. */
const DEFAULT_GRAMS_PER_PIECE = 150;

interface MacroRow {
  caloriesPer100g: number | null;
  proteinPer100g: number | null;
  carbsPer100g: number | null;
  fatPer100g: number | null;
  fiberPer100g: number | null;
  gramsPerPiece: number | null;
}

export interface ComputedNutrition {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

/**
 * Estimated grams of an ingredient line. Volume units are approximated 1 ml ≈ 1 g
 * (close enough for a nutrition estimate); count units use gramsPerPiece.
 */
export function quantityToGrams(
  quantity: number,
  unit: string,
  gramsPerPiece: number | null,
): number | null {
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  const { family, toBase } = normalizeUnit(unit);
  const baseQty = quantity * toBase;
  if (family === 'mass' || family === 'volume') return baseQty * 100; // base is 100g / 100ml
  return baseQty * (gramsPerPiece ?? DEFAULT_GRAMS_PER_PIECE);
}

/**
 * Adds `grams` of the given catalog row's macros into `total` (mutates).
 * Returns false when the row has no calorie data (caller counts it as unmatched).
 */
export function addMacros(total: ComputedNutrition, row: MacroRow, grams: number): boolean {
  if (row.caloriesPer100g == null) return false;
  const factor = grams / 100;
  total.calories += row.caloriesPer100g * factor;
  total.protein += (row.proteinPer100g ?? 0) * factor;
  total.carbs += (row.carbsPer100g ?? 0) * factor;
  total.fat += (row.fatPer100g ?? 0) * factor;
  total.fiber += (row.fiberPer100g ?? 0) * factor;
  return true;
}
