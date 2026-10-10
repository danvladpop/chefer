// ─── Measurement unit display formatting ──────────────────────────────────────
// Recipes and shopping lists are authored in mixed units (g, oz, cups, tbsp…).
// The user picks a preferred unit system in Preferences and every displayed
// quantity is converted to it. This is DISPLAY-ONLY formatting — stored data
// keeps its original units.

export type UnitSystem = 'METRIC' | 'IMPERIAL';

type UnitFamily = 'mass' | 'volume' | 'count';

/** Grams (mass) or millilitres (volume) per one unit. */
const UNIT_DEFS: Record<string, { family: UnitFamily; toBase: number }> = {
  // Mass → grams
  g: { family: 'mass', toBase: 1 },
  gram: { family: 'mass', toBase: 1 },
  grams: { family: 'mass', toBase: 1 },
  kg: { family: 'mass', toBase: 1000 },
  oz: { family: 'mass', toBase: 28.35 },
  ounce: { family: 'mass', toBase: 28.35 },
  ounces: { family: 'mass', toBase: 28.35 },
  lb: { family: 'mass', toBase: 453.6 },
  lbs: { family: 'mass', toBase: 453.6 },
  pound: { family: 'mass', toBase: 453.6 },
  pounds: { family: 'mass', toBase: 453.6 },
  // Volume → millilitres
  ml: { family: 'volume', toBase: 1 },
  l: { family: 'volume', toBase: 1000 },
  litre: { family: 'volume', toBase: 1000 },
  litres: { family: 'volume', toBase: 1000 },
  liter: { family: 'volume', toBase: 1000 },
  liters: { family: 'volume', toBase: 1000 },
  tsp: { family: 'volume', toBase: 5 },
  teaspoon: { family: 'volume', toBase: 5 },
  teaspoons: { family: 'volume', toBase: 5 },
  tbsp: { family: 'volume', toBase: 15 },
  tablespoon: { family: 'volume', toBase: 15 },
  tablespoons: { family: 'volume', toBase: 15 },
  cup: { family: 'volume', toBase: 240 },
  cups: { family: 'volume', toBase: 240 },
  'fl oz': { family: 'volume', toBase: 29.57 },
};

/**
 * Count units that read wrong as stored ("1 pcs", "12 clove"): singular and
 * plural display forms, picked by the quantity.
 */
const COUNT_WORDS: Record<string, readonly [string, string]> = {
  pc: ['piece', 'pieces'],
  pcs: ['piece', 'pieces'],
  piece: ['piece', 'pieces'],
  pieces: ['piece', 'pieces'],
  clove: ['clove', 'cloves'],
  cloves: ['clove', 'cloves'],
};

/**
 * Rounds for display: integers when large, one decimal when small. With a
 * `locale` the digits use that locale's separators ("1,5" in de-DE); without
 * one the output is the plain "1.5" (fixed, for storage-adjacent copy).
 */
function fmt(value: number, locale?: string): string {
  const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  if (locale) {
    try {
      return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(rounded);
    } catch {
      // Unknown locale tag — fall through to the plain format.
    }
  }
  if (value >= 10) return String(rounded);
  return rounded % 1 === 0 ? String(rounded) : rounded.toFixed(1);
}

/**
 * Formats a quantity + unit for display in the user's preferred unit system.
 *
 * METRIC: everything mass-based becomes g/kg, everything volume-based becomes
 * ml/l — including kitchen units ("2 cups" → "480 ml").
 * IMPERIAL: mass becomes oz/lb, ml/l become fl oz/cups; tsp/tbsp/cup pass
 * through (they are already imperial kitchen units).
 * Count units (piece, medium, clove, …) and unknown units pass through as-is.
 */
export function formatQuantity(
  quantity: number,
  unit: string,
  system: UnitSystem,
  locale?: string,
): string {
  const f = (value: number) => fmt(value, locale);
  if (!Number.isFinite(quantity)) return `${quantity} ${unit}`;
  const def = UNIT_DEFS[unit.toLowerCase().trim()];
  if (!def || def.family === 'count') {
    const count = COUNT_WORDS[unit.toLowerCase().trim()];
    if (count) return `${f(quantity)} ${quantity === 1 ? count[0] : count[1]}`;
    return `${f(quantity)} ${unit}`.trim();
  }

  const base = quantity * def.toBase; // grams or millilitres

  if (system === 'METRIC') {
    if (def.family === 'mass') {
      return base >= 1000 ? `${f(base / 1000)} kg` : `${f(base)} g`;
    }
    return base >= 1000 ? `${f(base / 1000)} l` : `${f(base)} ml`;
  }

  // IMPERIAL
  if (def.family === 'mass') {
    return base >= 453.6 ? `${f(base / 453.6)} lb` : `${f(base / 28.35)} oz`;
  }
  // Volume: keep the authored unit when it is already an imperial kitchen unit
  const key = unit.toLowerCase().trim();
  if (key.startsWith('tsp') || key.startsWith('teaspoon')) return `${f(quantity)} tsp`;
  if (key.startsWith('tbsp') || key.startsWith('tablespoon')) return `${f(quantity)} tbsp`;
  if (key.startsWith('cup')) return `${f(quantity)} cup${quantity === 1 ? '' : 's'}`;
  if (key === 'fl oz') return `${f(quantity)} fl oz`;
  return base >= 480 ? `${f(base / 240)} cups` : `${f(base / 29.57)} fl oz`;
}

// ─── One preference across Food and Gym (backlog P2-6) ────────────────────────
// ChefProfile.preferredUnits and GymProfile.unit are kept in sync both ways:
// METRIC ↔ KG, IMPERIAL ↔ LB.

/** The gym load unit that matches a unit system. */
export function weightUnitForSystem(system: UnitSystem): 'KG' | 'LB' {
  return system === 'IMPERIAL' ? 'LB' : 'KG';
}

/** The unit system that matches a gym load unit. */
export function systemForWeightUnit(unit: 'KG' | 'LB'): UnitSystem {
  return unit === 'LB' ? 'IMPERIAL' : 'METRIC';
}
