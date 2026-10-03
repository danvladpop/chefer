import type { UnitSystem } from './units';

// ─── One quantity vocabulary (WP-11, audit §6.4: UX-SHOP-01/03/05) ────────────
// Parsing "2 lb chicken thighs", normalising unit spellings and knowing which
// units are a mass, a volume or a count used to be re-invented per screen
// (the Shop add-item box understood g/kg/ml/l/pcs only, so "2 lb chicken
// thighs" became "Lb chicken · 2 pcs"). This is the single copy: the API's
// aggregation, the Shop and Pantry add boxes (mobile and web) all use it.

// ─── Unit names ───────────────────────────────────────────────────────────────

/** Mass → grams, volume → millilitres. */
export const MASS_TO_G: Readonly<Record<string, number>> = { g: 1, kg: 1000, oz: 28.35, lb: 453.6 };
export const VOLUME_TO_ML: Readonly<Record<string, number>> = {
  ml: 1,
  l: 1000,
  tsp: 5,
  tbsp: 15,
  cup: 240,
  'fl oz': 29.57,
};

const UNIT_ALIASES: Readonly<Record<string, string>> = {
  gram: 'g',
  grams: 'g',
  gr: 'g',
  kilogram: 'kg',
  kilograms: 'kg',
  kgs: 'kg',
  kilo: 'kg',
  kilos: 'kg',
  ounce: 'oz',
  ounces: 'oz',
  lbs: 'lb',
  pound: 'lb',
  pounds: 'lb',
  millilitre: 'ml',
  milliliter: 'ml',
  millilitres: 'ml',
  milliliters: 'ml',
  mls: 'ml',
  litre: 'l',
  liter: 'l',
  litres: 'l',
  liters: 'l',
  teaspoon: 'tsp',
  teaspoons: 'tsp',
  tablespoon: 'tbsp',
  tablespoons: 'tbsp',
  tbsps: 'tbsp',
  tsps: 'tsp',
  tbs: 'tbsp',
  tbl: 'tbsp',
  cups: 'cup',
  floz: 'fl oz',
  'fl. oz': 'fl oz',
  'fl oz.': 'fl oz',
  'fluid ounce': 'fl oz',
  'fluid ounces': 'fl oz',
  pieces: 'piece',
  pcs: 'piece',
  pc: 'piece',
  // Size words and "each" are how recipes count whole items — all one unit,
  // so "4 pcs" and "4 large" eggs merge into one line (UX-SHOP-04).
  large: 'piece',
  medium: 'piece',
  small: 'piece',
  whole: 'piece',
  each: 'piece',
  unit: 'piece',
  units: 'piece',
  item: 'piece',
  items: 'piece',
  cloves: 'clove',
  slices: 'slice',
  cans: 'can',
  tins: 'can',
  tin: 'can',
  packs: 'pack',
  packet: 'pack',
  packets: 'pack',
  package: 'pack',
  packages: 'pack',
  bunches: 'bunch',
  handfuls: 'handful',
  sprigs: 'sprig',
  stalks: 'stalk',
  pinches: 'pinch',
  heads: 'head',
};

/** "Tbsp", "cups, chopped", "g (dry)" → "tbsp", "cup", "g". Count units normalise to "piece". */
export function normalizeUnit(unit: string): string {
  const key = unit.toLowerCase().trim();
  const stripped = key.split(/[,(]/)[0]?.trim() ?? '';
  const base = stripped.length > 0 ? stripped : key;
  return UNIT_ALIASES[base] ?? base;
}

export type UnitFamily = 'mass' | 'volume';

/** The mass/volume family of a NORMALISED unit and its factor to g / ml; null for counts. */
export function unitFamily(unit: string): { family: UnitFamily; factor: number } | null {
  if (unit in MASS_TO_G) return { family: 'mass', factor: MASS_TO_G[unit] ?? 1 };
  if (unit in VOLUME_TO_ML) return { family: 'volume', factor: VOLUME_TO_ML[unit] ?? 1 };
  return null;
}

// ─── parseQuantityLine ────────────────────────────────────────────────────────

/** The units an add-item box understands, as typed → the short form the list stores. */
const PARSE_UNITS: readonly (readonly [RegExp, string])[] = [
  [/fl\.?\s?oz\.?|fluid\s+ounces?/, 'fl oz'],
  [/kgs?|kilos?|kilograms?/, 'kg'],
  [/g|grams?|gr/, 'g'],
  [/lbs?\.?|pounds?/, 'lb'],
  [/oz\.?|ounces?/, 'oz'],
  [/ml|mls|millilit(?:re|er)s?/, 'ml'],
  [/l|lit(?:re|er)s?/, 'l'],
  [/cups?/, 'cup'],
  [/tbsps?|tbs|tbl|tablespoons?/, 'tbsp'],
  [/tsps?|teaspoons?/, 'tsp'],
  [/cans?|tins?/, 'can'],
  [/packs?|packets?|packages?/, 'pack'],
  [/pcs|pc|pieces?/, 'pcs'],
];

const UNICODE_FRACTIONS: Readonly<Record<string, number>> = {
  '½': 0.5,
  '¼': 0.25,
  '¾': 0.75,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '⅛': 0.125,
};

const QTY_PATTERN = '(\\d+\\s+\\d+/\\d+|\\d+/\\d+|\\d*[.,]?\\d+(?:[½¼¾⅓⅔⅛])?|[½¼¾⅓⅔⅛])';

function parseLeadingNumber(raw: string): number | null {
  const text = raw.trim();
  const mixed = /^(\d+)\s+(\d+)\/(\d+)$/.exec(text);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const fraction = /^(\d+)\/(\d+)$/.exec(text);
  if (fraction) return Number(fraction[2]) === 0 ? null : Number(fraction[1]) / Number(fraction[2]);
  const glyph = /^(\d*)([½¼¾⅓⅔⅛])$/.exec(text);
  if (glyph) return Number(glyph[1]) + (UNICODE_FRACTIONS[glyph[2] ?? ''] ?? 0);
  const n = Number(text.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export type ParsedQuantity = {
  /** What is left once the amount and unit are taken off ("chicken thighs"). */
  name: string;
  /** Absent for a plain name. */
  qty?: number;
  /** Short form (lb, oz, cup, tbsp, tsp, fl oz, can, pack, g, kg, ml, l, pcs); absent for a bare count. */
  unit?: string;
};

/**
 * Splits an add-item line into amount, unit and name:
 *   "2 lb chicken thighs" → { qty: 2, unit: 'lb', name: 'chicken thighs' }
 *   "500g rice"           → { qty: 500, unit: 'g', name: 'rice' }
 *   "1 1/2 cups of flour" → { qty: 1.5, unit: 'cup', name: 'flour' }
 *   "3 eggs"              → { qty: 3, name: 'eggs' }       (no unit word)
 *   "paneer"              → { name: 'paneer' }
 * The leftover text is always kept as the name (UX-SHOP-01). A unit only
 * counts as a whole word, so "2 large eggs" stays a bare count of "large
 * eggs" and "2 garlic" is not 2 g of "arlic".
 */
export function parseQuantityLine(raw: string): ParsedQuantity {
  const text = raw.trim().replace(/\s+/g, ' ');
  const plain: ParsedQuantity = { name: text };

  const lead = new RegExp(`^${QTY_PATTERN}\\s*(?:x(?=\\s))?\\s*(.*)$`, 'i').exec(text);
  if (!lead) return plain;
  const qty = parseLeadingNumber(lead[1] ?? '');
  const rest = (lead[2] ?? '').trim();
  if (qty === null || !(qty > 0) || qty > 9999 || rest === '') return plain;

  for (const [pattern, unit] of PARSE_UNITS) {
    const m = new RegExp(
      `^(${pattern.source})(?![\\p{L}\\p{N}])\\.?\\s*(?:of\\s+)?(.*)$`,
      'iu',
    ).exec(rest);
    const name = m?.[m.length - 1]?.trim();
    if (m && name) return { name, qty, unit };
  }
  return { name: rest, qty };
}

/** A grams-by-default rule for a big bare number: "225 paneer" is a weight, not 225 pieces (bug B-32). */
const LARGE_BARE_NUMBER_UNIT_THRESHOLD = 20;

/**
 * `parseQuantityLine` for the Shop/Pantry add boxes: a bare number above 20
 * with no unit word is read as grams (nobody buys 225 pieces of paneer), a
 * small one stays a bare count that the server stores as "pcs".
 */
export function parseCustomItemInput(raw: string): {
  name: string;
  quantity?: number;
  unit?: string;
} {
  const parsed = parseQuantityLine(raw);
  if (parsed.qty === undefined) return { name: parsed.name };
  const unit = parsed.unit ?? (parsed.qty > LARGE_BARE_NUMBER_UNIT_THRESHOLD ? 'g' : undefined);
  return { name: parsed.name, quantity: parsed.qty, ...(unit && { unit }) };
}

/** The add-item placeholder in the user's own units (UX-SHOP-01: it used to teach kg to imperial users). */
export function addItemPlaceholder(system: UnitSystem): string {
  return system === 'IMPERIAL' ? 'Add item… e.g. 2 lb chicken' : 'Add item… e.g. 2 kg flour';
}

/** Unit chips for a pantry/shop quantity field in the user's system. */
export function unitOptionsFor(system: UnitSystem): readonly string[] {
  return system === 'IMPERIAL'
    ? ['pcs', 'lb', 'oz', 'cup', 'fl oz', 'pack', 'can', 'bunch']
    : ['pcs', 'g', 'kg', 'ml', 'l', 'pack', 'can', 'bunch'];
}
