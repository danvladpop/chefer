// ─── Shopping-line aggregation (audit F-SHOP-1-1, F-SHOP-1-3) ─────────────────
// One pure pipeline turns a week's recipe ingredients into shopping lines. It
// feeds the derived list, the AI-consolidation prompt and the planner's cost
// chip, so the chip and the list total are computed from the same lines.
//
// Before: the merge key was the raw name + raw unit, so "Olive oil" appeared
// three times (tbsp / tsp / ml), "Egg" and "Eggs" were separate, and water,
// ice cubes and "salt and pepper — to taste" were listed and priced.

export interface IngredientLine {
  name: string;
  quantity: number;
  unit: string;
  recipeId: string;
}

export interface ShoppingLine {
  /** Merge key WITHOUT the plan-id prefix (callers prefix it). */
  keyPart: string;
  /** Display name: the shortest original wording in the group. */
  name: string;
  quantity: number;
  unit: string;
  recipeIds: string[];
}

// Mass → grams, volume → millilitres.
const MASS: Record<string, number> = { g: 1, kg: 1000, oz: 28.35, lb: 453.6 };
const VOLUME: Record<string, number> = { ml: 1, l: 1000, tsp: 5, tbsp: 15, cup: 240 };

const UNIT_ALIASES: Record<string, string> = {
  gram: 'g',
  grams: 'g',
  kilogram: 'kg',
  kilograms: 'kg',
  kgs: 'kg',
  ounce: 'oz',
  ounces: 'oz',
  lbs: 'lb',
  pound: 'lb',
  pounds: 'lb',
  millilitre: 'ml',
  milliliter: 'ml',
  millilitres: 'ml',
  milliliters: 'ml',
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
  cups: 'cup',
  pieces: 'piece',
  pcs: 'piece',
  pc: 'piece',
  cloves: 'clove',
  slices: 'slice',
  cans: 'can',
  bunches: 'bunch',
  handfuls: 'handful',
  sprigs: 'sprig',
  stalks: 'stalk',
  pinches: 'pinch',
};

/** "Tbsp", "cups, chopped", "g (dry)" → "tbsp", "cup", "g". */
export function normalizeUnit(unit: string): string {
  const key = unit.toLowerCase().trim();
  const stripped = key.split(/[,(]/)[0]?.trim() ?? '';
  const base = stripped.length > 0 ? stripped : key;
  return UNIT_ALIASES[base] ?? base;
}

function unitFamily(unit: string): { family: 'mass' | 'volume'; factor: number } | null {
  if (unit in MASS) return { family: 'mass', factor: MASS[unit] ?? 1 };
  if (unit in VOLUME) return { family: 'volume', factor: VOLUME[unit] ?? 1 };
  return null;
}

// Preparation and freshness words that don't change what you buy.
const PREP_WORDS = new Set([
  'fresh',
  'chopped',
  'minced',
  'diced',
  'sliced',
  'grated',
  'shredded',
  'finely',
  'roughly',
  'thinly',
  'large',
  'small',
  'medium',
  'ripe',
  'drained',
  'rinsed',
  'peeled',
]);

function singular(word: string): string {
  if (word.length <= 3) return word;
  if (/(ss|us|is)$/.test(word)) return word; // hummus, asparagus, swiss
  if (word.endsWith('ies')) return `${word.slice(0, -3)}y`; // berries
  if (/(toes|shes|ches|xes)$/.test(word)) return word.slice(0, -2); // tomatoes, radishes
  if (word.endsWith('s')) return word.slice(0, -1); // eggs, peppers
  return word;
}

/**
 * The grouping identity of an ingredient name: lowercase, no parentheticals
 * or trailing prep ("Canned chickpeas (drained)", "parsley, chopped"), no
 * leading prep adjectives ("Fresh parsley"), last word singular ("Eggs").
 */
export function canonicalIngredientName(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .split(',')[0]!
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0);
  while (cleaned.length > 1 && PREP_WORDS.has(cleaned[0]!)) cleaned.shift();
  if (cleaned.length === 0) return name.toLowerCase().trim();
  cleaned[cleaned.length - 1] = singular(cleaned[cleaned.length - 1]!);
  return cleaned.join(' ');
}

const ALWAYS_SKIPPED = new Set([
  'water',
  'cold water',
  'warm water',
  'hot water',
  'boiling water',
  'ice',
  'ice cube',
]);
const SEASONINGS = new Set([
  'salt',
  'pepper',
  'black pepper',
  'white pepper',
  'ground pepper',
  'ground black pepper',
  'sea salt',
  'kosher salt',
  'flaky salt',
]);

/**
 * Lines nobody shops for: tap water, ice, "to taste" amounts and bare
 * salt-and-pepper seasoning. They were listed and priced (water €13.10).
 */
export function isSkippedLine(name: string, unit: string): boolean {
  const lower = name.toLowerCase();
  if (normalizeUnit(unit) === 'to taste' || lower.includes('to taste')) return true;
  const canonical = canonicalIngredientName(name);
  if (ALWAYS_SKIPPED.has(canonical)) return true;
  const parts = lower
    .replace(/\([^)]*\)/g, ' ')
    .split(/&|\band\b|,/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map(canonicalIngredientName);
  return parts.length > 0 && parts.every((p) => SEASONINGS.has(p));
}

/**
 * True when `have` is known to be less than `need`. Unknown or incomparable
 * amounts ("some", 0, grams vs pieces) are never "short".
 */
export function isShortOf(
  have: { quantity: number; unit: string },
  need: { quantity: number; unit: string },
): boolean {
  if (!(have.quantity > 0) || !(need.quantity > 0)) return false;
  const hu = normalizeUnit(have.unit);
  const nu = normalizeUnit(need.unit);
  const hf = unitFamily(hu);
  const nf = unitFamily(nu);
  if (hf && nf) {
    if (hf.family !== nf.family) return false;
    return have.quantity * hf.factor < need.quantity * nf.factor;
  }
  if (hu !== nu) return false;
  return have.quantity < need.quantity;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Merges ingredient lines by canonical name and unit family. Mass lines sum
 * in grams and volume lines in millilitres, then the total is expressed in
 * the unit that contributed most (13.5 tbsp + 2 tsp + 25 ml olive oil →
 * 15.8 tbsp). Count-like units (piece, clove, can, …) only merge with the
 * same unit. A group of one keeps the historical key, so existing check-offs
 * survive the change.
 */
export function aggregateIngredientLines(lines: IngredientLine[]): ShoppingLine[] {
  type Group = {
    canonical: string;
    unitKey: string;
    names: string[];
    rawKeys: Set<string>;
    recipeIds: Set<string>;
    // per normalized unit: summed quantity (in that unit)
    byUnit: Map<string, number>;
    // per normalized unit: the first original spelling ("pieces", "cloves")
    spelling: Map<string, string>;
  };
  const groups = new Map<string, Group>();

  for (const line of lines) {
    if (!Number.isFinite(line.quantity) || line.quantity < 0) continue;
    if (isSkippedLine(line.name, line.unit)) continue;
    const canonical = canonicalIngredientName(line.name);
    const unit = normalizeUnit(line.unit);
    const family = unitFamily(unit);
    const unitKey = family ? family.family : unit;
    const groupKey = `${canonical}|${unitKey}`;
    let group = groups.get(groupKey);
    if (!group) {
      group = {
        canonical,
        unitKey,
        names: [],
        rawKeys: new Set(),
        recipeIds: new Set(),
        byUnit: new Map(),
        spelling: new Map(),
      };
      groups.set(groupKey, group);
    }
    group.names.push(line.name.trim());
    group.rawKeys.add(`${line.name.toLowerCase().trim()}|${line.unit.toLowerCase().trim()}`);
    group.recipeIds.add(line.recipeId);
    group.byUnit.set(unit, (group.byUnit.get(unit) ?? 0) + line.quantity);
    if (!group.spelling.has(unit)) group.spelling.set(unit, line.unit.trim());
  }

  return [...groups.values()].map((group) => {
    const shortest = group.names.reduce((a, b) => (b.length < a.length ? b : a));
    const name = shortest.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
    const displayName = name.charAt(0).toUpperCase() + name.slice(1);

    let quantity: number;
    let unit: string;
    const units = [...group.byUnit.entries()];
    if (units.length === 1) {
      // Nothing converted: keep the recipe's own wording ("2 cloves", not
      // "2 clove").
      const [only, sum] = units[0]!;
      unit = group.spelling.get(only) ?? only;
      quantity = sum;
    } else {
      // Mixed units within one family: sum in the base unit, then express
      // in the unit that contributed the most.
      let total = 0;
      let bestUnit = units[0]![0];
      let bestAmount = -1;
      for (const [u, q] of units) {
        const base = q * (unitFamily(u)?.factor ?? 1);
        total += base;
        if (base > bestAmount) {
          bestAmount = base;
          bestUnit = u;
        }
      }
      unit = bestUnit;
      quantity = total / (unitFamily(bestUnit)?.factor ?? 1);
    }

    const [onlyRawKey] = group.rawKeys;
    const keyPart =
      group.rawKeys.size === 1 && onlyRawKey ? onlyRawKey : `${group.canonical}|${group.unitKey}`;

    return {
      keyPart,
      name: displayName,
      quantity: round1(quantity),
      unit,
      recipeIds: [...group.recipeIds],
    };
  });
}

/** "2" or "2.5" — the list's quantity string format. */
export function formatLineQuantity(quantity: number): string {
  return Number.isInteger(quantity) ? String(quantity) : quantity.toFixed(1);
}

/** A stored list row (derived or AI-consolidated) — the shape tidyListItems takes. */
export interface ListItemLike {
  key: string;
  ingredientName: string;
  quantity: string;
  unit: string;
}

/**
 * Applies the same rules to an already-built list — used for AI-consolidated
 * lists, which bypass aggregateIngredientLines: skips water / "to taste"
 * lines and merges leftover duplicates the model didn't catch. Untouched
 * rows keep their key (and so their check-off); a merged row takes the
 * first row's key.
 */
export function tidyListItems<T extends ListItemLike>(items: T[]): T[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    if (isSkippedLine(item.ingredientName, item.unit)) continue;
    const unit = normalizeUnit(item.unit);
    const family = unitFamily(unit);
    const groupKey = `${canonicalIngredientName(item.ingredientName)}|${family ? family.family : unit}`;
    const group = groups.get(groupKey);
    if (group) group.push(item);
    else groups.set(groupKey, [item]);
  }
  return [...groups.values()].map((group) => {
    if (group.length === 1) return group[0]!;
    const [merged] = aggregateIngredientLines(
      group.map((item) => ({
        name: item.ingredientName,
        quantity: parseFloat(item.quantity),
        unit: item.unit,
        recipeId: '',
      })),
    );
    const first = group[0]!;
    if (!merged) return first;
    return {
      ...first,
      ingredientName: merged.name,
      quantity: formatLineQuantity(merged.quantity),
      unit: merged.unit,
    };
  });
}
