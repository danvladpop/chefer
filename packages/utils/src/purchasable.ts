import { ingredientBaseKey } from './nutrition/ingredient-name';
import { MASS_TO_G, normalizeUnit, VOLUME_TO_ML } from './quantity';

// ─── Quantities you can shop for (WP-11, UX-SHOP-03) ──────────────────────────
// A recipe's arithmetic is not a shopping list: scaling and merging produced
// "0.8 avocado", "5.5 cloves garlic", "Onion 3.2 oz" and "Lemon zest 27 ml"
// next to "Lemon juice 27 ml". These helpers turn that arithmetic into what
// goes in the basket. The API applies them when it builds the list, so both
// apps (and the share sheet, and the price total) read the same lines.

export type PurchasableLine = { name: string; quantity: number; unit: string };

/** Typical grams of ONE whole item, for produce that is bought by the piece. */
const PIECE_GRAMS: Readonly<Record<string, number>> = {
  onion: 150,
  'red onion': 150,
  'spring onion': 15,
  shallot: 40,
  tomato: 120,
  potato: 170,
  'sweet potato': 250,
  carrot: 70,
  avocado: 170,
  lemon: 100,
  lime: 70,
  orange: 180,
  apple: 180,
  pear: 170,
  banana: 120,
  'bell pepper': 150,
  'red pepper': 150,
  'green pepper': 150,
  'yellow pepper': 150,
  cucumber: 300,
  courgette: 200,
  zucchini: 200,
  aubergine: 300,
  eggplant: 300,
  egg: 55,
  leek: 150,
  'garlic bulb': 50,
};

/** Above this many whole items a line stays a weight ("2 kg potatoes", not "12 potatoes"). */
const MAX_PIECES_FROM_WEIGHT = 12;

/** Units that are a count of things: always a whole number, never fewer than one. */
const COUNT_UNITS = new Set([
  'piece',
  'clove',
  'slice',
  'can',
  'pack',
  'bunch',
  'head',
  'sprig',
  'stalk',
  'handful',
  '',
]);

/** Float noise (2.0000001) must not become 3; a real 2.06 does. */
const COUNT_EPSILON = 0.05;

const round2 = (n: number): number => Math.round(n * 100) / 100;

function ceilTo(value: number, step: number): number {
  return round2(Math.ceil(value / step - 1e-9) * step);
}

/** Rounds a metric weight/volume up to a step a shelf actually offers. */
function roundMetricUp(baseQuantity: number): number {
  if (baseQuantity < 100) return ceilTo(baseQuantity, 5);
  if (baseQuantity < 1000) return ceilTo(baseQuantity, 10);
  return ceilTo(baseQuantity, 50);
}

/**
 * The amount to put in the basket for a computed list line:
 *   0.8 avocado → 1 · 5.5 cloves → 6 · 90 g onion → 1 onion · 252 g → 260 g.
 * Counts round UP to whole items (never below one), produce sold by the piece
 * but written as a weight becomes a count (when it is a handful of items),
 * and weights and volumes round up to a step a shelf offers. Anything unknown
 * ("a pinch", "to taste") is returned untouched.
 */
export function roundToPurchasable<T extends PurchasableLine>(item: T): T {
  const quantity = item.quantity;
  if (!Number.isFinite(quantity) || quantity <= 0) return item;
  const unit = normalizeUnit(item.unit);

  if (unit in MASS_TO_G) {
    const grams = quantity * (MASS_TO_G[unit] ?? 1);
    const pieceGrams = PIECE_GRAMS[ingredientBaseKey(item.name)];
    if (pieceGrams !== undefined) {
      const pieces = Math.max(1, Math.ceil(grams / pieceGrams - COUNT_EPSILON));
      if (pieces <= MAX_PIECES_FROM_WEIGHT) return { ...item, quantity: pieces, unit: 'pcs' };
    }
    if (unit === 'g') return { ...item, quantity: roundMetricUp(quantity) };
    if (unit === 'kg') return { ...item, quantity: ceilTo(quantity, 0.05) };
    return { ...item, quantity: ceilTo(quantity, quantity < 1 ? 0.25 : 0.5) };
  }

  if (unit in VOLUME_TO_ML) {
    if (unit === 'ml') return { ...item, quantity: roundMetricUp(quantity) };
    if (unit === 'l') return { ...item, quantity: ceilTo(quantity, 0.05) };
    return { ...item, quantity: ceilTo(quantity, quantity < 1 ? 0.25 : 0.5) };
  }

  if (COUNT_UNITS.has(unit)) {
    return { ...item, quantity: Math.max(1, Math.ceil(quantity - COUNT_EPSILON)) };
  }
  return item;
}

// ─── Zest + juice → fruit ─────────────────────────────────────────────────────

/** Millilitres of zest and of juice one fruit gives. */
const CITRUS_YIELD_ML: Readonly<Record<string, { zest: number; juice: number }>> = {
  lemon: { zest: 15, juice: 45 },
  lime: { zest: 10, juice: 30 },
  orange: { zest: 20, juice: 80 },
};

const CITRUS_PART =
  /^(?:(?:finely\s+)?(?:grated|squeezed|fresh|freshly\s+squeezed)\s+)?(lemon|lime|orange)\s+(zest|juice)$/;
const CITRUS_PART_OF = /^(zest|juice)\s+of\s+(?:an?\s+|\d+\s+)?(lemon|lime|orange)s?$/;

export type CitrusLine = {
  name: string;
  quantity: number;
  unit: string;
  recipeId: string;
  slug?: string | undefined;
};

/** "Lemon zest" / "juice of a lime" → which fruit and which part; null for anything else. */
function citrusPart(name: string): { fruit: string; part: 'zest' | 'juice' } | null {
  const key = name.toLowerCase().split(/[,(]/)[0]?.replace(/\s+/g, ' ').trim();
  if (!key) return null;
  const a = CITRUS_PART.exec(key);
  if (a?.[1] && a[2]) return { fruit: a[1], part: a[2] as 'zest' | 'juice' };
  const b = CITRUS_PART_OF.exec(key);
  if (b?.[1] && b[2]) return { fruit: b[2], part: b[1] as 'zest' | 'juice' };
  return null;
}

/** A zest or juice amount as millilitres (grams count 1:1); null when the unit can't say. */
function citrusMl(quantity: number, unit: string): number | null {
  const u = normalizeUnit(unit);
  if (u === 'g') return quantity;
  const factor = VOLUME_TO_ML[u];
  return factor === undefined ? null : quantity * factor;
}

/**
 * "Lemon zest 27 ml" and "Lemon juice 27 ml" are one trip down the produce
 * aisle: both come off the same lemons. Per recipe, the fruit needed is the
 * larger of the two parts (zest and juice share a lemon); across recipes the
 * fruit adds up. Lines that aren't citrus zest or juice pass through
 * untouched; the replacement is a plain count line ("Lemon", `piece`) that
 * then merges with a "2 lemons" line from another recipe.
 */
export function mergeCitrusLines<T extends CitrusLine>(lines: readonly T[]): (T | CitrusLine)[] {
  type Need = { zest: number; juice: number };
  const needs = new Map<string, Need>(); // `${fruit}|${recipeId}`
  const passthrough: (T | CitrusLine)[] = [];

  for (const line of lines) {
    const part = citrusPart(line.name);
    const ml = part ? citrusMl(line.quantity, line.unit) : null;
    if (!part || ml === null || !(ml >= 0)) {
      passthrough.push(line);
      continue;
    }
    const key = `${part.fruit}|${line.recipeId}`;
    const need = needs.get(key) ?? { zest: 0, juice: 0 };
    need[part.part] += ml;
    needs.set(key, need);
  }

  if (needs.size === 0) return passthrough;
  for (const [key, need] of needs) {
    const [fruit = '', recipeId = ''] = key.split('|');
    const yields = CITRUS_YIELD_ML[fruit];
    if (!yields) continue;
    const fruitCount = Math.max(need.zest / yields.zest, need.juice / yields.juice);
    passthrough.push({
      name: fruit.charAt(0).toUpperCase() + fruit.slice(1),
      quantity: fruitCount,
      unit: 'piece',
      recipeId,
    });
  }
  return passthrough;
}
