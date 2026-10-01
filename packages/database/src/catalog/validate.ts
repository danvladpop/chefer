/**
 * Catalog validators — docs/plan-ingredient-catalog.md §4.5.
 *
 * Pure: no I/O, no Prisma. The data build (scripts/ingredients/build-catalog.ts)
 * and the later `ingredients:sync` (P4) both run `validateCatalog` over the same
 * entry shape, so a catalog that passes here passes everywhere.
 *
 * Severity:
 *   error   — the row is wrong and must not ship (range, energy, provenance,
 *             uniqueness, alias integrity, implausible portion).
 *   warning — a coverage gap: the row is correct but some recipe units will not
 *             resolve (no count portion, no density). The engine reports those
 *             lines as PARTIAL instead of guessing (invariant I6).
 *   info    — an allow-listed energy-check deviation, kept visible for review.
 */
import { ENERGY_ALLOW_LIST } from './energy-allow-list';

/**
 * Mirrors the Prisma `enum IngredientCategory` (schema.prisma). Kept local so
 * this module stays Prisma-free; validate.test.ts fails if the two drift.
 */
export const CATALOG_CATEGORIES = [
  'VEGETABLE',
  'FRUIT',
  'HERB_FRESH',
  'SPICE_DRIED',
  'LEGUME',
  'GRAIN_CEREAL',
  'FLOUR_BAKING',
  'PASTA_NOODLE',
  'BREAD_BAKERY',
  'NUT_SEED',
  'BEEF',
  'PORK',
  'LAMB_GOAT',
  'POULTRY',
  'GAME',
  'PROCESSED_MEAT',
  'FISH',
  'SEAFOOD',
  'EGG',
  'DAIRY_MILK',
  'DAIRY_CHEESE',
  'DAIRY_YOGURT_CREAM',
  'PLANT_PROTEIN',
  'PLANT_MILK',
  'OIL_FAT',
  'CONDIMENT_SAUCE',
  'VINEGAR',
  'SWEETENER',
  'CANNED_JARRED',
  'PICKLED_FERMENTED',
  'STOCK_BROTH',
  'BEVERAGE',
  'ALCOHOL_COOKING',
  'SUPPLEMENT',
  'SNACK_PREPARED',
  'OTHER',
] as const;
export type CatalogCategory = (typeof CATALOG_CATEGORIES)[number];

export const NUTRITION_SOURCES = ['USDA_FDC', 'CIQUAL', 'LABEL'] as const;
export type CatalogNutritionSource = (typeof NUTRITION_SOURCES)[number];

/** Volume units the engine converts through `densityGPerMl`; never portions. */
export const VOLUME_UNITS = ['ml', 'l', 'tsp', 'tbsp', 'cup'] as const;

/** Canonical count/household portion units (singular). */
export const COUNT_PORTION_UNITS = [
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
export type CountPortionUnit = (typeof COUNT_PORTION_UNITS)[number];

/** §4.5: every row in these categories needs at least one count portion. */
export const COUNT_PORTION_CATEGORIES: ReadonlySet<CatalogCategory> = new Set([
  'VEGETABLE',
  'FRUIT',
  'EGG',
  'BREAD_BAKERY',
]);

/**
 * §4.2/§4.5: categories whose items recipes commonly measure by volume
 * (cup/tbsp/tsp/ml), so every row needs `densityGPerMl`. The plan names
 * "liquids, oils, flours, sugar, rice, oats, grated cheese, yogurt"; this is
 * that list expressed as categories, plus the spoon-measured ones (spices,
 * sauces, seeds, dry legumes) that recipes routinely give in tsp/tbsp/cup.
 * Grated/shredded cheese is matched by slug (see DENSITY_SLUG_PATTERN).
 */
export const DENSITY_CATEGORIES: ReadonlySet<CatalogCategory> = new Set([
  'DAIRY_MILK',
  'DAIRY_YOGURT_CREAM',
  'PLANT_MILK',
  'OIL_FAT',
  'FLOUR_BAKING',
  'SWEETENER',
  'GRAIN_CEREAL',
  'LEGUME',
  'NUT_SEED',
  'SPICE_DRIED',
  'CONDIMENT_SAUCE',
  'VINEGAR',
  'STOCK_BROTH',
  'BEVERAGE',
  'ALCOHOL_COOKING',
]);
export const DENSITY_SLUG_PATTERN = /(^|-)(grated|shredded)(-|$)/;

export type CatalogAlias = { alias: string; locale: string };
export type CatalogPortion = { unit: string; grams: number; source: string };

/**
 * One catalog row as written to catalog.json (sorted by slug). Core nutrients
 * are nullable only so the validator can flag a value the source dataset did
 * not publish; a shipped catalog has none.
 */
export type CatalogEntry = {
  slug: string;
  name: string;
  category: string;
  aliases: CatalogAlias[];
  kcalPer100g: number | null;
  proteinPer100g: number | null;
  carbsPer100g: number | null;
  fatPer100g: number | null;
  fiberPer100g: number | null;
  sugarPer100g?: number | null;
  satFatPer100g?: number | null;
  sodiumMgPer100g?: number | null;
  densityGPerMl?: number | null;
  edibleFraction?: number | null;
  nutritionSource: string;
  sourceRef: string;
  sourceNote?: string;
  portions: CatalogPortion[];
};

export type ValidationSeverity = 'error' | 'warning' | 'info';
export type ValidationRule =
  | 'missing-nutrient'
  | 'range'
  | 'energy'
  | 'source-ref'
  | 'slug-format'
  | 'slug-unique'
  | 'name'
  | 'category'
  | 'alias-format'
  | 'alias-english'
  | 'alias-duplicate'
  | 'alias-slug-collision'
  | 'count-portion'
  | 'density'
  | 'density-range'
  | 'portion'
  | 'edible-fraction';

export type ValidationIssue = {
  slug: string;
  rule: ValidationRule;
  severity: ValidationSeverity;
  message: string;
};

export type ValidateOptions = {
  /** slug → reason. Defaults to ENERGY_ALLOW_LIST. */
  energyAllowList?: Readonly<Record<string, string>>;
};

/**
 * Alias / lookup-key normalization (§6.1): NFKD with combining marks stripped
 * (so "mărar" ≡ "marar", "jalapeño" ≡ "jalapeno"), lowercase, apostrophes
 * dropped, every other non-alphanumeric run (hyphens, commas, slashes) folded to
 * one space. "%" is kept so "dark chocolate 70%" stays distinct.
 */
export function normalizeAlias(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9%]+/g, ' ')
    .trim();
}

/** EU Regulation 1169/2011 Annex XIV factors (alcohol/polyols excluded). */
export function euEnergyKcal(e: {
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  fiberPer100g: number;
}): number {
  return 4 * e.proteinPer100g + 4 * e.carbsPer100g + 9 * e.fatPer100g + 2 * e.fiberPer100g;
}

/** Tolerance of the §4.5 energy check: ≤ 15 % or ≤ 15 kcal, whichever is looser. */
export function energyCheck(
  e: Pick<
    CatalogEntry,
    'kcalPer100g' | 'proteinPer100g' | 'carbsPer100g' | 'fatPer100g' | 'fiberPer100g'
  >,
): {
  computed: number;
  delta: number;
  ok: boolean;
} | null {
  const {
    kcalPer100g: kcal,
    proteinPer100g: p,
    carbsPer100g: c,
    fatPer100g: f,
    fiberPer100g: fib,
  } = e;
  if (kcal == null || p == null || c == null || f == null || fib == null) return null;
  const computed = euEnergyKcal({
    proteinPer100g: p,
    carbsPer100g: c,
    fatPer100g: f,
    fiberPer100g: fib,
  });
  const delta = kcal - computed;
  const ok = Math.abs(delta) <= 15 || Math.abs(delta) <= 0.15 * kcal;
  return { computed, delta, ok };
}

const CORE = [
  'kcalPer100g',
  'proteinPer100g',
  'carbsPer100g',
  'fatPer100g',
  'fiberPer100g',
] as const;
const MACROS = [
  'proteinPer100g',
  'carbsPer100g',
  'fatPer100g',
  'fiberPer100g',
  'sugarPer100g',
  'satFatPer100g',
] as const;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SOURCE_PREFIX: Record<CatalogNutritionSource, RegExp> = {
  USDA_FDC: /^fdc:\d+$/,
  CIQUAL: /^ciqual:\d+$/,
  LABEL: /^label:\S.*$/,
};
const MAX_PORTION_GRAMS = 2000;
const VOLUME_UNIT_SET: ReadonlySet<string> = new Set(VOLUME_UNITS);

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Row-local rules (everything that does not need the rest of the catalog). */
export function validateEntry(e: CatalogEntry, opts: ValidateOptions = {}): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  const slug = e.slug;
  const push = (rule: ValidationRule, severity: ValidationSeverity, message: string) =>
    out.push({ slug, rule, severity, message });
  const allow = opts.energyAllowList ?? ENERGY_ALLOW_LIST;

  if (!SLUG_RE.test(slug))
    push('slug-format', 'error', `slug "${slug}" must be kebab-case [a-z0-9-]`);
  if (e.name === '' || e.name.trim() !== e.name)
    push('name', 'error', 'name must be non-empty and trimmed');
  if (!(CATALOG_CATEGORIES as readonly string[]).includes(e.category))
    push('category', 'error', `unknown category "${e.category}"`);

  // ── nutrients ──
  for (const k of CORE) {
    if (!isNum(e[k]))
      push('missing-nutrient', 'error', `${k} is missing (source dataset publishes no value)`);
  }
  if (isNum(e.kcalPer100g) && (e.kcalPer100g < 0 || e.kcalPer100g > 900))
    push('range', 'error', `kcalPer100g ${e.kcalPer100g} outside 0–900`);
  for (const k of MACROS) {
    const v = e[k];
    if (isNum(v) && (v < 0 || v > 100)) push('range', 'error', `${k} ${v} outside 0–100 g`);
  }
  const { proteinPer100g: p, carbsPer100g: c, fatPer100g: f, fiberPer100g: fib } = e;
  if (isNum(p) && isNum(c) && isNum(f) && isNum(fib) && p + c + f + fib > 100.5)
    push('range', 'error', `protein+carbs+fat+fiber = ${(p + c + f + fib).toFixed(1)} g > 100.5 g`);
  if (isNum(e.sodiumMgPer100g) && (e.sodiumMgPer100g < 0 || e.sodiumMgPer100g > 40000))
    push('range', 'error', `sodiumMgPer100g ${e.sodiumMgPer100g} outside 0–40000 mg`);
  if (isNum(e.sugarPer100g) && isNum(c) && e.sugarPer100g > c + 0.5)
    push('range', 'warning', `sugar ${e.sugarPer100g} g exceeds available carbs ${c} g`);
  if (isNum(e.satFatPer100g) && isNum(f) && e.satFatPer100g > f + 0.5)
    push('range', 'error', `saturated fat ${e.satFatPer100g} g exceeds fat ${f} g`);

  const energy = energyCheck(e);
  if (energy && !energy.ok) {
    const msg = `kcal ${e.kcalPer100g} vs EU factors ${energy.computed.toFixed(0)} (Δ ${energy.delta.toFixed(0)})`;
    const reason = allow[slug];
    if (reason) push('energy', 'info', `${msg} — allow-listed: ${reason}`);
    else push('energy', 'error', `${msg} exceeds ±15 % / ±15 kcal`);
  }

  // ── provenance ──
  const src = e.nutritionSource as CatalogNutritionSource;
  if (!(NUTRITION_SOURCES as readonly string[]).includes(e.nutritionSource)) {
    push(
      'source-ref',
      'error',
      `nutritionSource "${e.nutritionSource}" must be one of ${NUTRITION_SOURCES.join(', ')}`,
    );
  } else if (!e.sourceRef || !SOURCE_PREFIX[src].test(e.sourceRef)) {
    push('source-ref', 'error', `sourceRef "${e.sourceRef}" does not match ${src}`);
  }

  // ── aliases (row-local) ──
  if (!e.aliases.some((a) => a.locale === 'en'))
    push('alias-english', 'error', 'needs at least one English alias');
  const seen = new Set<string>();
  for (const a of e.aliases) {
    if (!a.alias || normalizeAlias(a.alias) !== a.alias)
      push(
        'alias-format',
        'error',
        `alias "${a.alias}" is not normalized (expected "${normalizeAlias(a.alias)}")`,
      );
    if (a.locale !== 'en' && a.locale !== 'ro')
      push('alias-format', 'error', `alias "${a.alias}" has locale "${a.locale}" (en|ro)`);
    if (seen.has(a.alias))
      push('alias-duplicate', 'warning', `alias "${a.alias}" listed twice on this row`);
    seen.add(a.alias);
  }

  // ── portions / density / edible fraction ──
  const units = new Set<string>();
  for (const pt of e.portions) {
    if (!pt.unit || VOLUME_UNIT_SET.has(pt.unit))
      push(
        'portion',
        'error',
        `portion unit "${pt.unit}" is empty or a volume unit (volume goes through density)`,
      );
    if (units.has(pt.unit)) push('portion', 'error', `portion unit "${pt.unit}" listed twice`);
    units.add(pt.unit);
    if (!isNum(pt.grams) || pt.grams <= 0 || pt.grams >= MAX_PORTION_GRAMS)
      push(
        'portion',
        'error',
        `portion "${pt.unit}" = ${pt.grams} g outside (0, ${MAX_PORTION_GRAMS})`,
      );
    if (!pt.source) push('portion', 'error', `portion "${pt.unit}" has no source`);
  }
  const category = e.category as CatalogCategory;
  if (
    COUNT_PORTION_CATEGORIES.has(category) &&
    !e.portions.some((pt) => (COUNT_PORTION_UNITS as readonly string[]).includes(pt.unit))
  )
    push('count-portion', 'warning', `${category} row has no count portion (piece/medium/slice/…)`);
  if (e.densityGPerMl != null) {
    if (!isNum(e.densityGPerMl) || e.densityGPerMl < 0.02 || e.densityGPerMl > 2.5)
      push('density-range', 'error', `densityGPerMl ${e.densityGPerMl} outside 0.02–2.5`);
  } else if (DENSITY_CATEGORIES.has(category) || DENSITY_SLUG_PATTERN.test(slug)) {
    push(
      'density',
      'warning',
      `${category} row has no densityGPerMl (volume units will not resolve)`,
    );
  }
  if (
    e.edibleFraction != null &&
    (!isNum(e.edibleFraction) || e.edibleFraction <= 0 || e.edibleFraction > 1)
  )
    push('edible-fraction', 'error', `edibleFraction ${e.edibleFraction} outside (0, 1]`);

  return out;
}

/** Whole-catalog validation: row rules plus cross-row uniqueness. */
export function validateCatalog(
  entries: readonly CatalogEntry[],
  opts: ValidateOptions = {},
): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  for (const e of entries) out.push(...validateEntry(e, opts));

  const slugCount = new Map<string, number>();
  for (const e of entries) slugCount.set(e.slug, (slugCount.get(e.slug) ?? 0) + 1);
  for (const [slug, n] of slugCount)
    if (n > 1)
      out.push({ slug, rule: 'slug-unique', severity: 'error', message: `slug used by ${n} rows` });

  // Slugs compared both verbatim and as the space-separated key a resolver
  // would produce from them ("olive-oil" ≡ "olive oil").
  const slugKeys = new Map<string, string>();
  for (const e of entries) {
    slugKeys.set(e.slug, e.slug);
    slugKeys.set(e.slug.replace(/-/g, ' '), e.slug);
  }
  const aliasOwners = new Map<string, Set<string>>();
  for (const e of entries) {
    for (const a of e.aliases) {
      const owners = aliasOwners.get(a.alias) ?? new Set<string>();
      owners.add(e.slug);
      aliasOwners.set(a.alias, owners);
      const slugOwner = slugKeys.get(a.alias);
      if (slugOwner && slugOwner !== e.slug)
        out.push({
          slug: e.slug,
          rule: 'alias-slug-collision',
          severity: 'error',
          message: `alias "${a.alias}" equals the slug of "${slugOwner}"`,
        });
    }
  }
  for (const [alias, owners] of aliasOwners) {
    if (owners.size > 1) {
      const list = [...owners].sort();
      for (const slug of list)
        out.push({
          slug,
          rule: 'alias-duplicate',
          severity: 'error',
          message: `alias "${alias}" maps to ${list.length} rows: ${list.join(', ')}`,
        });
    }
  }
  return out;
}

/** Counts by severity and rule — handy for CLI summaries and CI gates. */
export function summarizeIssues(issues: readonly ValidationIssue[]): {
  errors: number;
  warnings: number;
  infos: number;
  byRule: Record<string, { error: number; warning: number; info: number }>;
} {
  const byRule: Record<string, { error: number; warning: number; info: number }> = {};
  let errors = 0;
  let warnings = 0;
  let infos = 0;
  for (const i of issues) {
    const r = (byRule[i.rule] ??= { error: 0, warning: 0, info: 0 });
    r[i.severity]++;
    if (i.severity === 'error') errors++;
    else if (i.severity === 'warning') warnings++;
    else infos++;
  }
  return { errors, warnings, infos, byRule };
}
