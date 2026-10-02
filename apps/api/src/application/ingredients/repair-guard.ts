import { readCatalogFile } from '@chefer/database';
import { normalizeIngredientKey, normalizeRecipeUnit } from '@chefer/utils';

// ─── Guard on AI line repairs (plan-ingredient-catalog §6.3) ──────────────────
// The repair round asks a model for a catalog slug and an amount. A 2026-10-02
// dry run on prod showed the two ways it goes wrong, both of which would store
// wrong numbers as COMPUTED:
//   - it copies the count into grams: "1 head broccoli" → 1 g, "2 cans tuna" → 2 g;
//   - it picks a food whose name merely looks alike: "curry paste" → dry pasta.
// Every repair passes through `repairRejection` before it is applied (the new-
// recipe finisher and the legacy regenerator alike). A rejected line stays a
// problem line: unresolved beats wrong.

export interface RepairOriginal {
  rawName: string;
  quantity: number;
  unit: string;
  /** The catalog row the line already names (only the unit failed), if any. */
  slug?: string | undefined;
  /** Resolver suggestions offered to the model. */
  candidates: readonly string[];
}

export interface RepairProposal {
  slug: string;
  quantity: number;
  unit: string;
}

export interface RepairTargetRow {
  slug: string;
  name: string;
  aliases: readonly string[];
}

/** One line's amount beyond this is a model slip, not a recipe quantity. */
export const MAX_REPAIR_AMOUNT = 2000;

// Words that never identify a food on their own.
const FILLER = new Set([
  'fresh',
  'dried',
  'dry',
  'raw',
  'cooked',
  'boiled',
  'canned',
  'frozen',
  'whole',
  'large',
  'small',
  'medium',
  'chopped',
  'sliced',
  'diced',
  'ground',
  'organic',
  'plain',
  'sweet',
  'leftover',
  'leftovers',
  'style',
  'mixed',
  'with',
  'and',
  'for',
  'the',
  'paleo',
  'optional',
  'vanilla',
  'unsweetened',
  'light',
  'low',
  'fat',
  'free',
  'thick',
  'thin',
  'cut',
]);

function foodWords(text: string): Set<string> {
  return new Set(
    normalizeIngredientKey(text.replace(/-/g, ' '))
      .split(' ')
      .filter((w) => w.length >= 3 && !FILLER.has(w))
      .map((w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w)),
  );
}

/** Why a repair must not be applied, or null when it may be. */
export function repairRejection(
  original: RepairOriginal,
  fix: RepairProposal,
  row: RepairTargetRow | undefined,
): string | null {
  if (!row) return `unknown slug "${fix.slug}"`;
  if (!(fix.quantity > 0) || fix.quantity > MAX_REPAIR_AMOUNT)
    return `implausible amount ${fix.quantity} ${fix.unit}`;

  // The food: a line that already named its row keeps it (only the unit was
  // wrong); otherwise the pick must be a suggestion or share a food word.
  if (original.slug && fix.slug !== original.slug)
    return `changed a known food (${original.slug} → ${fix.slug})`;
  if (!original.slug && !original.candidates.includes(fix.slug)) {
    const said = foodWords(original.rawName);
    const offered = foodWords([row.slug, row.name, ...row.aliases].join(' '));
    if (![...said].some((w) => offered.has(w)))
      return `"${row.slug}" does not match "${original.rawName}"`;
  }

  // The amount: a different unit with the very same number is a copied count
  // ("1 head" → "1 g"), except grams ↔ millilitres, which are close for most liquids.
  const from = normalizeRecipeUnit(original.unit);
  const to = normalizeRecipeUnit(fix.unit);
  const gramMl = new Set(['g', 'ml']);
  if (
    from.unit !== to.unit &&
    fix.quantity === original.quantity &&
    !(gramMl.has(from.unit) && gramMl.has(to.unit))
  )
    return `copied the count (${original.quantity} ${original.unit} → ${fix.quantity} ${fix.unit})`;
  return null;
}

let rows: Map<string, RepairTargetRow> | null = null;

/** Catalog rows by slug for the food check (the committed catalog.json, read once). */
export function catalogRepairRows(): ReadonlyMap<string, RepairTargetRow> {
  rows ??= new Map(
    readCatalogFile().map((e) => [
      e.slug,
      { slug: e.slug, name: e.name, aliases: e.aliases.map((a) => a.alias) },
    ]),
  );
  return rows;
}
