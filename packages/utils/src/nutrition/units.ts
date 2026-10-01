// ─── Recipe units for computed nutrition (plan-ingredient-catalog §5.1) ───────
// Pure: no I/O, shared by the API (server truth), web and mobile (live
// preview). Unlike the display formatter in ../units.ts and the price
// heuristics in the API, this table never guesses grams: a unit either has an
// exact mass or volume factor, is a "tiny" amount with a fixed weight, or is a
// portion unit whose grams come from that ingredient's own portion data.

/** Grams per one unit. */
export const NUTRITION_MASS_UNITS = {
  g: 1,
  kg: 1000,
  oz: 28.3495,
  lb: 453.592,
} as const;
export type NutritionMassUnit = keyof typeof NUTRITION_MASS_UNITS;

/** Millilitres per one unit (US customary spoons and cup, as FDC uses). */
export const NUTRITION_VOLUME_UNITS = {
  ml: 1,
  l: 1000,
  tsp: 4.93,
  tbsp: 14.79,
  cup: 236.6,
} as const;
export type NutritionVolumeUnit = keyof typeof NUTRITION_VOLUME_UNITS;

/** Fixed grams for tiny amounts, whatever the ingredient; `to taste` counts as 0 g. */
export const NUTRITION_TINY_UNITS = {
  pinch: 0.36,
  dash: 0.6,
  'to taste': 0,
} as const;
export type NutritionTinyUnit = keyof typeof NUTRITION_TINY_UNITS;

/**
 * Count / household units whose grams come from the ingredient's
 * `IngredientPortion` rows. A missing portion makes the line unresolved
 * (NO_PORTION); there is no default weight (I6).
 */
export const NUTRITION_PORTION_UNITS = [
  'piece',
  'small',
  'medium',
  'large',
  'extra-large',
  'clove',
  'slice',
  'can',
  'jar',
  'bunch',
  'sprig',
  'leaf',
  'head',
  'stalk',
  'fillet',
  'breast',
  'thigh',
  'drumstick',
  'wing',
  'scoop',
  'bar',
  'sheet',
  'cube',
  'packet',
  'ear',
  'wedge',
  'stick',
] as const;
export type NutritionPortionUnit = (typeof NUTRITION_PORTION_UNITS)[number];

export type NutritionUnitKind = 'mass' | 'volume' | 'tiny' | 'portion' | 'unknown';

export interface NormalizedRecipeUnit {
  /** Canonical unit, or the cleaned-up text when the unit is unknown. */
  unit: string;
  kind: NutritionUnitKind;
  /** Prep text split off the unit: "g, chopped" → "chopped". */
  note?: string;
}

/** Synonyms and plurals → canonical unit. Keys are lowercase, single-spaced. */
const UNIT_SYNONYMS: Record<string, string> = {
  // mass
  gram: 'g',
  grams: 'g',
  gr: 'g',
  grm: 'g',
  kilogram: 'kg',
  kilograms: 'kg',
  kgs: 'kg',
  kilo: 'kg',
  kilos: 'kg',
  ounce: 'oz',
  ounces: 'oz',
  pound: 'lb',
  pounds: 'lb',
  lbs: 'lb',
  // volume
  milliliter: 'ml',
  milliliters: 'ml',
  millilitre: 'ml',
  millilitres: 'ml',
  mls: 'ml',
  liter: 'l',
  liters: 'l',
  litre: 'l',
  litres: 'l',
  teaspoon: 'tsp',
  teaspoons: 'tsp',
  tsps: 'tsp',
  tablespoon: 'tbsp',
  tablespoons: 'tbsp',
  tbsps: 'tbsp',
  tbs: 'tbsp',
  tbl: 'tbsp',
  cups: 'cup',
  // tiny
  pinches: 'pinch',
  dashes: 'dash',
  taste: 'to taste',
  'to-taste': 'to taste',
  // portion
  pieces: 'piece',
  pc: 'piece',
  pcs: 'piece',
  whole: 'piece',
  count: 'piece',
  unit: 'piece',
  units: 'piece',
  item: 'piece',
  items: 'piece',
  med: 'medium',
  sm: 'small',
  lg: 'large',
  xl: 'extra-large',
  'extra large': 'extra-large',
  cloves: 'clove',
  slices: 'slice',
  cans: 'can',
  tin: 'can',
  tins: 'can',
  jars: 'jar',
  bunches: 'bunch',
  sprigs: 'sprig',
  leaves: 'leaf',
  heads: 'head',
  stalks: 'stalk',
  stick: 'stick',
  sticks: 'stick',
  fillets: 'fillet',
  filet: 'fillet',
  filets: 'fillet',
  breasts: 'breast',
  thighs: 'thigh',
  drumsticks: 'drumstick',
  wings: 'wing',
  scoops: 'scoop',
  bars: 'bar',
  sheets: 'sheet',
  cubes: 'cube',
  packets: 'packet',
  ears: 'ear',
  wedges: 'wedge',
};

const MASS = new Set<string>(Object.keys(NUTRITION_MASS_UNITS));
const VOLUME = new Set<string>(Object.keys(NUTRITION_VOLUME_UNITS));
const TINY = new Set<string>(Object.keys(NUTRITION_TINY_UNITS));
const PORTION = new Set<string>(NUTRITION_PORTION_UNITS);

function kindOf(unit: string): NutritionUnitKind {
  if (MASS.has(unit)) return 'mass';
  if (VOLUME.has(unit)) return 'volume';
  if (TINY.has(unit)) return 'tiny';
  if (PORTION.has(unit)) return 'portion';
  return 'unknown';
}

function canonical(text: string): string {
  const t = text.trim().replace(/\.$/, '');
  return UNIT_SYNONYMS[t] ?? t;
}

/**
 * Maps a free-text unit to its canonical form and splits trailing prep text
 * into `note`:
 * - `"grams"` → `g`
 * - `"cloves, minced"` → `clove` + note `minced`
 * - `"can (15oz)"` → `can` + note `15oz`
 * - `"cup chopped"` → `cup` + note `chopped`
 *
 * An empty unit means a bare count ("2 eggs") and maps to `piece`; its grams
 * still come only from the ingredient's `piece` portion. Anything else
 * unrecognised comes back with kind `unknown`, and the engine leaves that line
 * unresolved unless the ingredient defines a portion of exactly that name.
 */
export function normalizeRecipeUnit(raw: string | null | undefined): NormalizedRecipeUnit {
  const text = (raw ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (text === '') return { unit: 'piece', kind: 'portion' };

  const whole = canonical(text);
  if (kindOf(whole) !== 'unknown') return { unit: whole, kind: kindOf(whole) };

  // "unit, prep" / "unit (prep)"
  const split = /^([^,(]+?)\s*(?:,\s*|\(\s*)(.+?)\)?$/.exec(text);
  if (split?.[1] && split[2]) {
    const head = canonical(split[1]);
    const kind = kindOf(head);
    if (kind !== 'unknown') return { unit: head, kind, note: split[2].trim() };
  }

  // "unit prep words" (first word is the unit)
  const space = text.indexOf(' ');
  if (space > 0) {
    const head = canonical(text.slice(0, space));
    const kind = kindOf(head);
    if (kind !== 'unknown') return { unit: head, kind, note: text.slice(space + 1).trim() };
  }

  return { unit: whole, kind: 'unknown' };
}
