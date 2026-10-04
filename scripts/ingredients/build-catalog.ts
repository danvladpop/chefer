/**
 * Catalog v1 builder (docs/plan-ingredient-catalog.md §4.4 steps 3–5).
 *
 *   pnpm ingredients:build
 *
 * Reads scripts/ingredients/catalog-draft.json (names + one source pointer per
 * row) and the raw datasets in scripts/ingredients/out/sources/, and writes:
 *   out/catalog.candidate.json  the catalog rows, sorted by slug (the contract
 *                               for catalog.json and the P4 sync)
 *   out/catalog.build.json      per-row build diagnostics + validator issues +
 *                               demand coverage (input for review-page.ts)
 *
 *   pnpm ingredients:build --catalog
 *
 * also writes packages/database/data/ingredients/catalog.json (byte-identical
 * to the candidate). Use it only after the owner has spot-checked the review
 * page; a build with validator errors refuses to write it.
 *
 * Every number in the output is read from a dataset file. A value the
 * dataset does not publish stays null, and the validators report it.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ENERGY_ALLOW_LIST } from '../../packages/database/src/catalog/energy-allow-list';
import {
  applyPortionsOverlay,
  readPortionsOverlay,
  validatePortionsOverlay,
} from '../../packages/database/src/catalog/portions-overlay';
import {
  summarizeIssues,
  validateCatalog,
  type CatalogEntry,
  type CatalogPortion,
  type ValidationIssue,
} from '../../packages/database/src/catalog/validate';
import { loadDraft, type DraftEntry } from './lib/draft';
import { buildIndex, classifyMiss, resolveName, type MissClass } from './lib/normalize';
import { mapPortions, pickDensity, type MappedPortion } from './lib/portions';
import {
  C,
  CIQUAL_RELEASE,
  FDC_FOUNDATION_RELEASE,
  FDC_SR_LEGACY_RELEASE,
  INGREDIENTS_DIR,
  loadSources,
  N,
  OUT_DIR,
  parseCiqualValue,
  type FdcFood,
  type Sources,
} from './lib/sources';

/** The committed catalog (D7: git is the source of truth for global rows). */
const CATALOG_PATH = join(INGREDIENTS_DIR, '../../packages/database/data/ingredients/catalog.json');
/** FDC portion units never imported: US can sizes do not fit the EU market. */
const SKIPPED_FDC_PORTION_UNITS = ['can'];

// Owner decision 2026-10-02: a can is 400 g net (the common EU size). Rows that
// count only the solids ("…, drained") get 240 g, the drained weight a 400 g
// EU can of beans/vegetables prints on its label. Fish, seafood and meat cans
// are much smaller than 400 g, so they get no can portion.
const CAN_NET_GRAMS = 400;
const CAN_DRAINED_GRAMS = 240;
const NO_CAN_CATEGORIES = new Set([
  'FISH',
  'SEAFOOD',
  'POULTRY',
  'BEEF',
  'PORK',
  'LAMB_GOAT',
  'GAME',
  'PROCESSED_MEAT',
]);

function canPortion(slug: string, name: string, category: string): CatalogPortion | null {
  if (!/(^|-)canned(-|$)/.test(slug) || NO_CAN_CATEGORIES.has(category)) return null;
  return /drained/i.test(name)
    ? { unit: 'can', grams: CAN_DRAINED_GRAMS, source: 'owner:can-400g-drained' }
    : { unit: 'can', grams: CAN_NET_GRAMS, source: 'owner:can-400g' };
}

const ANIMAL_ORIGIN = new Set([
  'BEEF',
  'PORK',
  'LAMB_GOAT',
  'POULTRY',
  'GAME',
  'FISH',
  'SEAFOOD',
  'EGG',
  'DAIRY_MILK',
  'DAIRY_CHEESE',
  'DAIRY_YOGURT_CREAM',
]);

export type RowDiagnostics = {
  slug: string;
  sourceDataset: 'fdc-foundation' | 'fdc-sr-legacy' | 'ciqual' | 'label';
  sourceDescription: string;
  sourceUrl: string;
  portionsDetail: (MappedPortion | { unit: string; grams: number; source: string; text: string })[];
  densityDetail?: string;
  review?: string;
  note?: string;
};

export type BuildOutput = {
  generatedFrom: Record<string, string>;
  rows: RowDiagnostics[];
  issues: ValidationIssue[];
  summary: ReturnType<typeof summarizeIssues>;
  coverage: Coverage;
  vocabulary: VocabularyCoverage;
};

export type Coverage = {
  names: number;
  lines: number;
  resolvedNames: number;
  resolvedLines: number;
  top95Names: number;
  top95Resolved: number;
  resolved: { name: string; lines: number; slug: string; key: string }[];
  unresolved: { name: string; lines: number; class: MissClass }[];
};

const r2 = (v: number) => Math.round(v * 100) / 100;

export function fdcUrl(id: number) {
  return `https://fdc.nal.usda.gov/food-details/${id}/nutrients`;
}
export function ciqualUrl(code: number) {
  return `https://ciqual.anses.fr/#/aliments/${code}`;
}

function buildFdcRow(
  d: DraftEntry,
  f: FdcFood,
  src: Sources,
  notes: string[],
): Omit<CatalogEntry, 'portions' | 'densityGPerMl'> {
  const g = (id: number) => f.nutrients.get(id);
  let kcal = g(N.energyKcal);
  if (kcal === undefined && f.dataset === 'foundation') {
    kcal = g(N.energyAtwaterSpecific);
    if (kcal !== undefined)
      notes.push('energy: FDC 2048 (Atwater specific factors); 1008 not published');
    else {
      kcal = g(N.energyAtwaterGeneral);
      if (kcal !== undefined)
        notes.push('energy: FDC 2047 (Atwater general factors); 1008 not published');
    }
  }
  let fiber = g(N.fiber);
  if (fiber === undefined && ANIMAL_ORIGIN.has(d.category)) {
    fiber = 0;
    notes.push('fiber not published; 0 for animal-origin food');
  }
  let carbs: number | undefined;
  const cbd = g(N.carbByDifference);
  if (cbd !== undefined) {
    if (fiber !== undefined) carbs = r2(Math.max(0, cbd - fiber));
  } else if (g(N.carbBySummation) !== undefined) {
    carbs = g(N.carbBySummation);
    notes.push('carbs: FDC 1050 (by summation); 1005 not published');
  }
  void src;
  return {
    slug: d.slug,
    name: d.name,
    category: d.category,
    aliases: d.aliases,
    kcalPer100g: kcal ?? null,
    proteinPer100g: g(N.protein) ?? null,
    carbsPer100g: carbs ?? null,
    fatPer100g: g(N.fat) ?? null,
    fiberPer100g: fiber ?? null,
    sugarPer100g: g(N.sugarsTotalNlea) ?? g(N.sugarsTotal) ?? null,
    satFatPer100g: g(N.satFat) ?? null,
    sodiumMgPer100g: g(N.sodium) ?? null,
    nutritionSource: 'USDA_FDC',
    sourceRef: `fdc:${f.fdcId}`,
  };
}

function buildRow(d: DraftEntry, src: Sources): { entry: CatalogEntry; diag: RowDiagnostics } {
  const notes: string[] = [];
  let base: Omit<CatalogEntry, 'portions' | 'densityGPerMl'>;
  let diag: RowDiagnostics;

  const fdcFoods = (ids: number[] | undefined): FdcFood[] =>
    (ids ?? []).map((id) => {
      const f = src.fdc.get(id);
      if (!f) throw new Error(`${d.slug}: FDC food ${id} not found in the downloaded datasets`);
      return f;
    });

  let ownFdc: FdcFood | undefined;
  if (d.source.db === 'fdc') {
    const f = src.fdc.get(d.source.id);
    if (!f) throw new Error(`${d.slug}: FDC food ${d.source.id} not found`);
    ownFdc = f;
    base = buildFdcRow(d, f, src, notes);
    diag = {
      slug: d.slug,
      sourceDataset: f.dataset === 'foundation' ? 'fdc-foundation' : 'fdc-sr-legacy',
      sourceDescription: f.description,
      sourceUrl: fdcUrl(f.fdcId),
      portionsDetail: [],
    };
  } else if (d.source.db === 'ciqual') {
    const f = src.ciqual.get(d.source.id);
    if (!f) throw new Error(`${d.slug}: CIQUAL food ${d.source.id} not found`);
    const g = (c: number) => parseCiqualValue(f.raw.get(c));
    let fiber = g(C.fiber);
    if (fiber === undefined && ANIMAL_ORIGIN.has(d.category)) {
      fiber = 0;
      notes.push('fiber not published; 0 for animal-origin food');
    }
    const lt = [C.kcalEu, C.protein, C.carbs, C.fat, C.fiber].filter(
      (c) => /^</.test(f.raw.get(c) ?? '') || f.raw.get(c) === 'traces',
    );
    if (lt.length) notes.push('CIQUAL "<x"/"traces" values read per SOURCES.md rule');
    base = {
      slug: d.slug,
      name: d.name,
      category: d.category,
      aliases: d.aliases,
      kcalPer100g: g(C.kcalEu) ?? null,
      proteinPer100g: g(C.protein) ?? null,
      carbsPer100g: g(C.carbs) ?? null,
      fatPer100g: g(C.fat) ?? null,
      fiberPer100g: fiber ?? null,
      sugarPer100g: g(C.sugars) ?? null,
      satFatPer100g: g(C.satFat) ?? null,
      sodiumMgPer100g: g(C.sodium) ?? null,
      nutritionSource: 'CIQUAL',
      sourceRef: `ciqual:${f.code}`,
    };
    diag = {
      slug: d.slug,
      sourceDataset: 'ciqual',
      sourceDescription: `${f.nameEn} / ${f.nameFr}`,
      sourceUrl: ciqualUrl(f.code),
      portionsDetail: [],
    };
  } else {
    const v = d.source.values;
    base = {
      slug: d.slug,
      name: d.name,
      category: d.category,
      aliases: d.aliases,
      kcalPer100g: v.kcal,
      proteinPer100g: v.protein,
      carbsPer100g: v.carbs,
      fatPer100g: v.fat,
      fiberPer100g: v.fiber,
      sugarPer100g: v.sugar ?? null,
      satFatPer100g: v.satFat ?? null,
      sodiumMgPer100g: v.sodiumMg ?? null,
      nutritionSource: 'LABEL',
      sourceRef: `label:${d.source.ref}`,
    };
    notes.push(`EU nutrition label retrieved ${d.source.retrieved}`);
    diag = {
      slug: d.slug,
      sourceDataset: 'label',
      sourceDescription: d.source.ref,
      sourceUrl: d.source.ref,
      portionsDetail: [],
    };
  }

  // Portions: own FDC food first, then portionsFrom.
  const portionFoods = [...(ownFdc ? [ownFdc] : []), ...fdcFoods(d.portionsFrom)];
  // FDC "can" portions are US can sizes (tomato purée can = 822 g), so they are
  // never imported: "can" lines stay PARTIAL until a cited EU size is added
  // (owner decision, 2026-10-01).
  const mapped = mapPortions(portionFoods, {
    portionAs: d.portionAs,
    skipUnits: [...SKIPPED_FDC_PORTION_UNITS, ...(d.skipPortions ?? [])],
  });
  const portions: CatalogPortion[] = mapped.map((p) => ({
    unit: p.unit,
    grams: p.grams,
    source: p.source,
  }));
  const can = canPortion(d.slug, base.name, base.category);
  if (can && !portions.some((p) => p.unit === 'can')) {
    portions.push(can);
    notes.push(
      `can = ${can.grams} g (owner decision 2026-10-02: 400 g net can${can.grams === CAN_NET_GRAMS ? '' : ', drained weight'})`,
    );
  }
  diag.portionsDetail = mapped;
  const borrowed = mapped.filter((p) => p.fdcId !== ownFdc?.fdcId).map((p) => p.fdcId);
  if (borrowed.length) notes.push(`portions from fdc:${[...new Set(borrowed)].join(', fdc:')}`);
  if (d.portionAs && Object.keys(d.portionAs).length)
    notes.push(
      `portion pinned: ${Object.entries(d.portionAs)
        .map(([id, u]) => `fdc-portion:${id} = 1 ${u}`)
        .join('; ')}`,
    );

  // Density: densityFrom, else own food then portionsFrom.
  const densityFoods = d.densityFrom !== undefined ? fdcFoods([d.densityFrom]) : portionFoods;
  const dens = pickDensity(densityFoods);
  let densityGPerMl: number | null = null;
  if (dens) {
    densityGPerMl = dens.density;
    const m = dens.measure;
    diag.densityDetail = `${m.portion.amount} ${m.text} = ${m.portion.gramWeight} g (fdc:${m.fdcId}, fdc-portion:${m.portion.id})`;
    notes.push(
      `density from fdc-portion:${m.portion.id} "${m.portion.amount} ${m.text}" = ${m.portion.gramWeight} g${m.fdcId !== ownFdc?.fdcId ? ` (fdc:${m.fdcId})` : ''}`,
    );
  }

  if (d.note) notes.unshift(d.note);
  const allowReason = ENERGY_ALLOW_LIST[d.slug];
  if (allowReason) notes.push(`energy check allow-listed: ${allowReason}`);
  diag.review = d.review;
  diag.note = d.note;
  const entry: CatalogEntry = {
    ...base,
    ...(densityGPerMl !== null ? { densityGPerMl } : {}),
    ...(notes.length ? { sourceNote: notes.join('; ') } : {}),
    portions,
  };
  // Drop optional nulls so the JSON stays clean (core nulls are kept for the validator).
  for (const k of ['sugarPer100g', 'satFatPer100g', 'sodiumMgPer100g'] as const)
    if (entry[k] === null) delete entry[k];
  return { entry, diag };
}

/** Field order of the output contract. */
function ordered(e: CatalogEntry): CatalogEntry {
  const keys: (keyof CatalogEntry)[] = [
    'slug',
    'name',
    'category',
    'aliases',
    'kcalPer100g',
    'proteinPer100g',
    'carbsPer100g',
    'fatPer100g',
    'fiberPer100g',
    'sugarPer100g',
    'satFatPer100g',
    'sodiumMgPer100g',
    'densityGPerMl',
    'edibleFraction',
    'nutritionSource',
    'sourceRef',
    'sourceNote',
    'portions',
  ];
  const out: Record<string, unknown> = {};
  for (const k of keys) if (e[k] !== undefined) out[k] = e[k];
  return out as CatalogEntry;
}

function readDemand(): { name: string; lines: number }[] {
  const text = readFileSync(join(OUT_DIR, 'demand.tsv'), 'utf8');
  return text
    .trim()
    .split('\n')
    .slice(1)
    .map((l) => l.split('\t'))
    .map(([name, lines]) => ({ name: name ?? '', lines: Number(lines) }))
    .filter((r) => r.name);
}

/** Names of the existing global vocabulary (global-prices.tsv). Its AI macros are never read. */
function readGlobalNames(): string[] {
  const text = readFileSync(join(OUT_DIR, 'global-prices.tsv'), 'utf8');
  return text
    .trim()
    .split('\n')
    .slice(1)
    .map((l) => l.split('\t')[0] ?? '')
    .filter(Boolean);
}

export type VocabularyCoverage = {
  names: number;
  resolved: number;
  unresolved: { name: string; class: MissClass }[];
};

export function computeVocabularyCoverage(entries: CatalogEntry[]): VocabularyCoverage {
  const idx = buildIndex(entries);
  const names = readGlobalNames().sort();
  const unresolved = names
    .filter((n) => !resolveName(n, idx))
    .map((name) => ({ name, class: classifyMiss(name) }));
  return { names: names.length, resolved: names.length - unresolved.length, unresolved };
}

export function computeCoverage(entries: CatalogEntry[]): Coverage {
  const demand = readDemand().sort((a, b) => b.lines - a.lines || a.name.localeCompare(b.name));
  const idx = buildIndex(entries);
  const totalLines = demand.reduce((s, r) => s + r.lines, 0);
  const resolved: Coverage['resolved'] = [];
  const unresolved: Coverage['unresolved'] = [];
  let cum = 0;
  let top95Names = 0;
  let top95Resolved = 0;
  for (const r of demand) {
    const inTop95 = cum < 0.95 * totalLines;
    cum += r.lines;
    const hit = resolveName(r.name, idx);
    if (inTop95) top95Names++;
    if (hit) {
      resolved.push({ name: r.name, lines: r.lines, slug: hit.slug, key: hit.key });
      if (inTop95) top95Resolved++;
    } else unresolved.push({ name: r.name, lines: r.lines, class: classifyMiss(r.name) });
  }
  return {
    names: demand.length,
    lines: totalLines,
    resolvedNames: resolved.length,
    resolvedLines: resolved.reduce((s, r) => s + r.lines, 0),
    top95Names,
    top95Resolved,
    resolved,
    unresolved,
  };
}

function main() {
  const draft = loadDraft();
  const src = loadSources();
  const built = draft.map((d) => buildRow(d, src));
  built.sort((a, b) => (a.entry.slug < b.entry.slug ? -1 : a.entry.slug > b.entry.slug ? 1 : 0));
  const entries = built.map((b) => ordered(b.entry));
  // The curated portions overlay (data/ingredients/portions-overlay.json) is merged at
  // read time, not written into catalog.json. Validate the catalog as the app sees it,
  // and fail loudly if a regenerated catalog now clashes with an overlay row.
  const overlayProblems = validatePortionsOverlay(readPortionsOverlay(), entries);
  if (overlayProblems.length > 0)
    throw new Error(`portions-overlay.json: ${overlayProblems.join('; ')}`);
  const issues = validateCatalog(applyPortionsOverlay(entries, readPortionsOverlay()));
  const summary = summarizeIssues(issues);
  const coverage = computeCoverage(entries);
  const vocabulary = computeVocabularyCoverage(entries);

  const catalogJson = `${JSON.stringify(entries, null, 2)}\n`;
  writeFileSync(join(OUT_DIR, 'catalog.candidate.json'), catalogJson);
  if (process.argv.includes('--catalog')) {
    if (summary.errors > 0)
      throw new Error(`${summary.errors} validator errors: catalog.json not written`);
    writeFileSync(CATALOG_PATH, catalogJson);
    console.log(`wrote ${entries.length} rows to ${CATALOG_PATH}`);
  }
  const out: BuildOutput = {
    generatedFrom: {
      draft: 'scripts/ingredients/catalog-draft.json',
      fdcFoundation: FDC_FOUNDATION_RELEASE,
      fdcSrLegacy: FDC_SR_LEGACY_RELEASE,
      ciqual: CIQUAL_RELEASE,
    },
    rows: built.map((b) => b.diag),
    issues,
    summary,
    coverage,
    vocabulary,
  };
  writeFileSync(join(OUT_DIR, 'catalog.build.json'), `${JSON.stringify(out, null, 2)}\n`);

  // ── console summary ──
  const byCat = new Map<string, number>();
  for (const e of entries) byCat.set(e.category, (byCat.get(e.category) ?? 0) + 1);
  const bySrc = new Map<string, number>();
  for (const b of built)
    bySrc.set(b.diag.sourceDataset, (bySrc.get(b.diag.sourceDataset) ?? 0) + 1);
  console.log(`rows: ${entries.length}`);
  console.log(`sources: ${[...bySrc].map(([k, v]) => `${k}=${v}`).join(' ')}`);
  console.log(
    `categories: ${[...byCat]
      .sort()
      .map(([k, v]) => `${k}=${v}`)
      .join(' ')}`,
  );
  console.log(
    `validator: ${summary.errors} errors, ${summary.warnings} warnings, ${summary.infos} info`,
  );
  for (const [rule, c] of Object.entries(summary.byRule))
    console.log(`  ${rule}: ${c.error}E ${c.warning}W ${c.info}I`);
  const pct = (a: number, b: number) => `${((100 * a) / b).toFixed(1)}%`;
  console.log(
    `coverage: names ${coverage.resolvedNames}/${coverage.names} (${pct(coverage.resolvedNames, coverage.names)}), lines ${coverage.resolvedLines}/${coverage.lines} (${pct(coverage.resolvedLines, coverage.lines)}), top-95% names ${coverage.top95Resolved}/${coverage.top95Names}`,
  );
  console.log(
    `global vocabulary: ${vocabulary.resolved}/${vocabulary.names} names resolve (${pct(vocabulary.resolved, vocabulary.names)})`,
  );
  if (process.argv.includes('--errors'))
    for (const i of issues.filter((x) => x.severity === 'error'))
      console.log(`  E ${i.slug} [${i.rule}] ${i.message}`);
  if (process.argv.includes('--warnings'))
    for (const i of issues.filter((x) => x.severity === 'warning'))
      console.log(`  W ${i.slug} [${i.rule}] ${i.message}`);
  if (process.argv.includes('--misses'))
    for (const u of coverage.unresolved) console.log(`  miss ${u.lines}\t${u.class}\t${u.name}`);
}

main();
