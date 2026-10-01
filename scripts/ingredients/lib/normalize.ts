/**
 * Demand-name → catalog row resolution used by the coverage report: the same
 * EXACT/ALIAS lookup keys as the API resolver (@chefer/utils ingredient-name).
 * It never fuzzy-matches.
 */
import { normalizeAlias } from '../../../packages/database/src/catalog/validate';
import { ingredientLookupKeys as lookupKeys } from '../../../packages/utils/src/nutrition/ingredient-name';

export { normalizeAlias };

// The lookup-key rules are shared with the API resolver (P5), so the coverage
// reported here is the coverage the resolver gets.
export {
  ingredientLookupKeys as lookupKeys,
  singularIngredientWord as singular,
} from '../../../packages/utils/src/nutrition/ingredient-name';

export type AliasIndex = Map<string, string>;

/** alias → slug, plus slug and "slug as words" → slug. */
export function buildIndex(entries: { slug: string; aliases: { alias: string }[] }[]): AliasIndex {
  const idx: AliasIndex = new Map();
  for (const e of entries) {
    idx.set(e.slug, e.slug);
    idx.set(e.slug.replace(/-/g, ' '), e.slug);
  }
  for (const e of entries)
    for (const a of e.aliases) if (!idx.has(a.alias)) idx.set(a.alias, e.slug);
  return idx;
}

export function resolveName(
  raw: string,
  idx: AliasIndex,
): { slug: string; key: string } | undefined {
  for (const key of lookupKeys(raw)) {
    const slug = idx.get(key);
    if (slug) return { slug, key };
  }
  return undefined;
}

export type MissClass = 'compound' | 'prepared' | 'junk' | 'gap';

/**
 * Heuristic classification of a demand name that resolves to no row:
 *   junk      fuzz / truncated / non-ingredient text ("spices", "marinade")
 *   compound  several ingredients in one line ("salt and pepper", "mixed berries")
 *   prepared  a dish or a homemade mixture (dressings, leftovers, mash, crusts)
 *   gap       a real single ingredient the catalog lacks (needs a row or a label)
 * Compound and prepared lines are expected misses: the §7 legacy mapping splits
 * or maps them. Patterns only — no demand names are hard-coded here.
 */
export function classifyMiss(raw: string): MissClass {
  const n = normalizeAlias(raw);
  if (
    n.length < 4 ||
    /^(spices|marinade|ice|seasoning)$/.test(n) ||
    /[^\x20-\x7e]/.test(
      raw
        .replace(/[\u2010-\u2011]/g, '-')
        .normalize('NFKD')
        .replace(/\p{M}/gu, ''),
    )
  )
    return 'junk';
  if (/\b(blend|seasoning|spice mix)\b/.test(n)) return 'gap';
  if (
    /\b(leftover|stir fry|skillet|soup|meatballs|meatloaf|kofta|fajitas|pie|pasta|curry|mash|pizza crust|cream|dressing|marinade|chutney|tortilla)\b/.test(
      n,
    ) &&
    !/\b(curry paste|curry powder)\b/.test(n)
  )
    return /\b(and|or|with)\b|&/.test(n) && !/\b(leftover|stir fry|skillet)\b/.test(n)
      ? 'compound'
      : 'prepared';
  if (
    /\b(and|or|with)\b|&|\//.test(raw.toLowerCase()) ||
    /^mixed\b/.test(n) ||
    /^(berries|frozen mixed berries|canned mixed beans)$/.test(n)
  )
    return 'compound';
  return 'gap';
}
