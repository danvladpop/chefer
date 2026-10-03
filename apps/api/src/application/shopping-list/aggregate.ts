// ─── Shopping-line aggregation (audit F-SHOP-1-1, F-SHOP-1-3) ─────────────────
// One pure pipeline turns a week's recipe ingredients into shopping lines. It
// feeds the derived list, the AI-consolidation prompt and the planner's cost
// chip, so the chip and the list total are computed from the same lines.
//
// Before: the merge key was the raw name + raw unit, so "Olive oil" appeared
// three times (tbsp / tsp / ml), "Egg" and "Eggs" were separate, and water,
// ice cubes and "salt and pepper — to taste" were listed and priced.

import {
  ingredientBaseKey,
  mergeCitrusLines,
  normalizeUnit,
  roundToPurchasable,
  slugToKey,
  unitFamily,
} from '@chefer/utils';

// Unit vocabulary (aliases, size words → "piece", mass/volume factors) lives in
// @chefer/utils `quantity.ts` — one copy for the API, Shop and Pantry
// (WP-11, UX-SHOP-04). Re-exported for the existing importers.
export { normalizeUnit };

export interface IngredientLine {
  name: string;
  quantity: number;
  unit: string;
  recipeId: string;
  /**
   * The catalog row this line is (recipe `slug`, plan-ingredient-catalog §6.2).
   * When present it is the merge identity — "Egg" and "Eggs" are one row — and
   * the free-text name only decides the display wording (UX-SHOP-04).
   */
  slug?: string | undefined;
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

/**
 * The grouping identity of an ingredient name: the shared catalog base key
 * (@chefer/utils `ingredientBaseKey`: no parentheticals or trailing prep, no
 * prep/size words, diacritics folded, singular), so the list groups exactly
 * the way the ingredient resolver matches (plan-ingredient-catalog §6.1).
 */
export function canonicalIngredientName(name: string): string {
  return ingredientBaseKey(name) || name.toLowerCase().trim();
}

/** Merge identity of a recipe line: the catalog slug when it has one, else the name's base key. */
function lineIdentity(line: { name: string; slug?: string | undefined }): string {
  return line.slug ? slugToKey(line.slug) : canonicalIngredientName(line.name);
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

/**
 * `have` expressed in `need`'s unit, when the two are comparable (same unit,
 * or the same mass/volume family) — `null` for "some"/0/incomparable amounts
 * (bug B-24, T-BUG-24: lets a caller show a PARTIAL match, e.g. "You have
 * 100 g of 250 g needed", instead of `isShortOf`'s all-or-nothing gate).
 */
export function coveredQuantity(
  have: { quantity: number; unit: string },
  need: { quantity: number; unit: string },
): number | null {
  if (!(have.quantity > 0) || !(need.quantity > 0)) return null;
  const hu = normalizeUnit(have.unit);
  const nu = normalizeUnit(need.unit);
  const hf = unitFamily(hu);
  const nf = unitFamily(nu);
  if (hf && nf) {
    return hf.family !== nf.family ? null : (have.quantity * hf.factor) / nf.factor;
  }
  return hu === nu ? have.quantity : null;
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
    // per normalized unit: every original spelling ("pieces", "large", "cloves")
    spelling: Map<string, string[]>;
  };
  const groups = new Map<string, Group>();

  // Zest + juice of one fruit are lemons, not two ml lines (UX-SHOP-03).
  for (const line of mergeCitrusLines(lines)) {
    if (!Number.isFinite(line.quantity) || line.quantity < 0) continue;
    if (isSkippedLine(line.name, line.unit)) continue;
    const canonical = lineIdentity(line);
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
    const spellings = group.spelling.get(unit) ?? [];
    const spelling = line.unit.trim();
    if (!spellings.includes(spelling)) spellings.push(spelling);
    group.spelling.set(unit, spellings);
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
      const spellings = group.spelling.get(only) ?? [];
      // One spelling is the recipe's own wording; several ("4 pcs" + "4 large")
      // collapse to the plain unit so the merged line doesn't pick a winner.
      unit = spellings.length === 1 ? (spellings[0] ?? only) : only === 'piece' ? 'pcs' : only;
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

    // What goes in the basket: whole items, shelf-sized weights (UX-SHOP-03).
    const buy = roundToPurchasable({ name: displayName, quantity: round1(quantity), unit });

    return {
      keyPart,
      name: displayName,
      quantity: buy.quantity,
      unit: buy.unit,
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
    if (group.length === 1) return roundListItem(group[0]!);
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

/** An AI-built row gets the same shopping-sized quantity the derived list does (UX-SHOP-03). */
function roundListItem<T extends ListItemLike>(item: T): T {
  const quantity = parseFloat(item.quantity);
  if (!Number.isFinite(quantity)) return item;
  const buy = roundToPurchasable({ name: item.ingredientName, quantity, unit: item.unit });
  if (buy.quantity === quantity && buy.unit === item.unit) return item;
  return { ...item, quantity: formatLineQuantity(buy.quantity), unit: buy.unit };
}
