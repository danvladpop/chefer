// ─── Ingredient name → catalog lookup keys (plan-ingredient-catalog §6.1) ────
// Pure and shared: the API resolver, the catalog build's coverage report and
// the shopping-list grouping key all derive keys the same way, so a name that
// resolves in one resolves in all. Keys are in the same normalized form as the
// catalog's aliases (packages/database `normalizeAlias`; an API test asserts the
// two stay identical).

/**
 * Lookup-key normalization: NFKD with combining marks stripped ("mărar" ≡
 * "marar", "jalapeño" ≡ "jalapeno"), lowercase, apostrophes dropped, every
 * other non-alphanumeric run folded to one space. "%" is kept so "dark
 * chocolate 70%" stays distinct.
 */
export function normalizeIngredientKey(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9%]+/g, ' ')
    .trim();
}

/** Prep / serving / size words that never change which ingredient a line is. */
const PREP_WORDS = new Set(
  (
    'chopped finely roughly coarsely diced minced sliced thinly thickly grated shredded crumbled halved quartered cubed ' +
    'peeled deveined pitted rinsed julienned spiralized mashed pressed torn trimmed cut into wedges wedged chunks ' +
    'optional for garnish to serve serving taste fresh ripe large small medium extra whole packed heaped level ' +
    'florets spears stalks stalk leaves leaf sprigs sprig cloves clove pieces piece slices slice cups cup ' +
    'plain natural organic clear of wedge wedges halves hearts and'
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

/** Singularizes one lowercase word with a few safe rules. */
export function singularIngredientWord(word: string): string {
  const irregular = IRREGULAR[word];
  if (irregular) return irregular;
  if (word.endsWith('ies') && word.length > 4) return `${word.slice(0, -3)}y`;
  if (/(ss|us|is|os)$/.test(word)) return word;
  if (/(ches|shes|xes|zes)$/.test(word)) return word.replace(/es$/, '');
  if (word.endsWith('oes')) return word.slice(0, -2);
  if (/[^s]s$/.test(word) && word.length > 3) return word.slice(0, -1);
  return word;
}

const singularPhrase = (s: string): string => s.split(' ').map(singularIngredientWord).join(' ');

/**
 * Candidate lookup keys for one raw ingredient name, most specific first:
 * the whole name, then without parentheticals and "for …" tails, then the text
 * before the first comma, then without prep words — each also singularized.
 * "Cherry tomatoes, halved" → ["cherry tomatoes halved", "cherry tomato halved",
 * "cherry tomatoes", "cherry tomato"].
 */
export function ingredientLookupKeys(raw: string): string[] {
  const keys: string[] = [];
  const add = (s: string): void => {
    const n = normalizeIngredientKey(s);
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
    add(
      normalizeIngredientKey(base)
        .split(' ')
        .filter((w) => !PREP_WORDS.has(w))
        .join(' '),
    );
  }
  return keys;
}

/**
 * The most reduced key: no parentheticals, nothing after the first comma, no
 * prep words, singular. Used for fuzzy candidates and as a grouping identity.
 * Falls back to the normalized name when stripping leaves nothing.
 */
export function ingredientBaseKey(raw: string): string {
  const keys = ingredientLookupKeys(raw);
  return keys[keys.length - 1] ?? normalizeIngredientKey(raw);
}

/** A slug as the space-separated key a resolver produces ("olive-oil" → "olive oil"). */
export function slugToKey(slug: string): string {
  return slug.replace(/-/g, ' ');
}

/** A kebab-case slug from a free-text name, for private ingredients ("Lidl Skyr!" → "lidl-skyr"). */
export function ingredientSlug(name: string): string {
  return normalizeIngredientKey(name).replace(/%/g, ' pct').trim().replace(/\s+/g, '-');
}
