/**
 * Demand-name → catalog row resolution used by the coverage report. It mirrors
 * what the P5 resolver will do with EXACT/ALIAS lookups: normalize, drop
 * parentheticals and prep words, singularize. It never fuzzy-matches.
 */
import { normalizeAlias } from '../../../packages/database/src/catalog/validate';

export { normalizeAlias };

/** Prep / serving words that never change which ingredient a line is. */
const PREP_WORDS = new Set(
  (
    'chopped finely roughly coarsely diced minced sliced thinly thickly grated shredded crumbled halved quartered cubed ' +
    'peeled deveined pitted rinsed julienned spiralized mashed pressed torn trimmed cut into wedges wedged chunks ' +
    'optional for garnish to serve serving taste fresh ripe large small medium extra whole packed heaped level ' +
    'florets spears stalks stalk leaves leaf sprigs sprig cloves clove pieces piece slices slice cups cup ' +
    'plain natural organic clear of wedge wedges halves hearts'
  ).split(/\s+/),
);

const IRREGULAR: Record<string, string> = {
  leaves: 'leaf',
  loaves: 'loaf',
  halves: 'half',
  knives: 'knife',
  potatoes: 'potato',
  tomatoes: 'tomato',
  mangoes: 'mango',
  avocados: 'avocado',
  radishes: 'radish',
  peaches: 'peach',
  dishes: 'dish',
  sandwiches: 'sandwich',
  anchovies: 'anchovy',
  cherries: 'cherry',
  berries: 'berry',
  chillies: 'chilli',
  chilies: 'chili',
};

/** Singularize one word with a few safe rules. */
export function singular(word: string): string {
  if (IRREGULAR[word]) return IRREGULAR[word];
  if (/ies$/.test(word) && word.length > 4) return word.replace(/ies$/, 'y');
  if (/(ss|us|is|os)$/.test(word)) return word;
  if (/(ches|shes|xes|zes)$/.test(word)) return word.replace(/es$/, '');
  if (/oes$/.test(word)) return word.replace(/es$/, '');
  if (/[^s]s$/.test(word) && word.length > 3) return word.slice(0, -1);
  return word;
}

const singularPhrase = (s: string) => s.split(' ').map(singular).join(' ');

/**
 * Candidate lookup keys for one raw name, most specific first:
 *   exact → without parentheticals → before the first comma → without prep words,
 * each also singularized.
 */
export function lookupKeys(raw: string): string[] {
  const keys: string[] = [];
  const add = (s: string) => {
    const n = normalizeAlias(s);
    if (!n) return;
    for (const k of [n, singularPhrase(n)]) if (!keys.includes(k)) keys.push(k);
  };
  add(raw);
  // "sunflower oil for wiping the pan" → "sunflower oil"
  const noParen = raw.replace(/\([^)]*\)/g, ' ').replace(/\s+for\s.*$/i, ' ');
  add(noParen);
  const beforeComma = noParen.split(',')[0] ?? '';
  add(beforeComma);
  for (const base of [noParen, beforeComma]) {
    const stripped = normalizeAlias(base)
      .split(' ')
      .filter((w) => !PREP_WORDS.has(w))
      .join(' ');
    add(stripped);
  }
  return keys;
}

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
