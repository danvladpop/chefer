/**
 * `pnpm --filter @chefer/api ingredients:migrate [--dry-run] [--report-dir DIR] [--limit N]`
 *
 * plan-ingredient-catalog §7 (D3): migrates EVERY recipe to the catalog format.
 *   1. links global price rows to their catalog rows (IngredientPrice.ingredientId);
 *   2. gives every user's pre-catalog custom ingredients a private catalog twin;
 *   3. for each recipe: maps its Json lines to catalog rows — exact/alias, then
 *      data/ingredients/legacy-mapping.json (names), then the legacy UNIT policy
 *      below — computes nutrition with the shared engine and writes the
 *      RecipeIngredient rows + nutrition (one transaction per recipe);
 *   4. writes a report (counts per source/status, kcal change distribution, the
 *      20 largest changes, every non-COMPUTED recipe with its offending lines).
 * Idempotent: it always recomputes from the Json mirror, which keeps what the
 * author wrote. Run it on dev, then a restored prod snapshot, then prod (after
 * a fresh backup) — never without --dry-run first.
 *
 * Legacy unit policy (migration only; live saves never substitute units): when
 * a line's unit has no portion on the matched row, try, in order —
 *   - a size stated in the unit text: "can (13.5 oz)" → 13.5 oz per can;
 *   - a prep word used as the unit ("halved", "pitted", "sliced") → a count;
 *   - a bare count ("", pieces, whole, count) → piece, else medium;
 *   - a size word the row lacks (small/medium/large) → the row's whole-unit piece;
 *   - stalk → medium (spring onions), strips → slice, slices/leaves → piece/leaf;
 *   - zest measured in fruit ("1 lemon" of lemon zest) → 1 tbsp per fruit.
 * Each substitution is recorded on the line's note and counted in the report.
 * Anything else (a bare "can", scoop, block, inch) stays unresolved: no default
 * weight is ever invented (I6).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ingredientRepository,
  prisma,
  readCatalogFile,
  recipeLineRepository,
  type CatalogIngredientRow,
  type RecipeLineWrite,
} from '@chefer/database';
import type { NutritionFacts } from '@chefer/types';
import { lineGrams, normalizeRecipeUnit } from '@chefer/utils';
import {
  ingredientResolver,
  toNutritionIngredient,
} from '../application/ingredients/ingredient-resolver.js';
import { mappingFor, unitSubstitutes } from '../application/ingredients/legacy-line-policy.js';
import { ensurePrivateTwins } from '../application/ingredients/private-twins.js';
import { recipeNutritionService } from '../application/ingredients/recipe-nutrition.service.js';
import { normalizeIngredientName } from '../lib/ingredient-prices/index.js';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const reportArg = args.indexOf('--report-dir');
const REPORT_DIR =
  (reportArg >= 0 ? args[reportArg + 1] : undefined) ?? 'ingredients-migrate-report';
const LIMIT = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : Infinity;
/** Re-migrate recipes that already have catalog lines (default: skip them). */
const FORCE = args.includes('--force');

interface JsonLine {
  name?: unknown;
  quantity?: unknown;
  unit?: unknown;
}

interface PlannedLine {
  write: RecipeLineWrite;
  row: CatalogIngredientRow | null;
  /** Why the line is unresolved (when row is null or the unit does not convert). */
  issue?: string;
  policy?: string;
  mapped?: string;
}

async function planRecipe(
  ingredients: JsonLine[],
  ownerId: string | null,
  globalsBySlug: Map<string, CatalogIngredientRow>,
): Promise<PlannedLine[]> {
  // expand mapping splits / slugs first
  type Pre = {
    name: string;
    quantity: number;
    unit: string;
    mirrorName?: string;
    slug?: string;
    partial?: string;
    mapped?: string;
    note?: string;
  };
  const pre: Pre[] = [];
  for (const l of ingredients) {
    const name = typeof l.name === 'string' ? l.name : '';
    const quantity = typeof l.quantity === 'number' ? l.quantity : Number.NaN;
    const unit = typeof l.unit === 'string' ? l.unit : '';
    const m = name ? mappingFor(name) : undefined;
    if (m && 'split' in m) {
      for (const part of m.split)
        pre.push({
          name: part.name,
          mirrorName: part.name,
          quantity: quantity * part.share,
          unit,
          slug: part.slug,
          mapped: `split "${name}"`,
        });
    } else if (m && 'slug' in m) {
      pre.push({
        name,
        quantity: quantity * (m.quantityFactor ?? 1),
        unit,
        slug: m.slug,
        mapped: `${m.proxy ? 'proxy' : 'mapped'} → ${m.slug}`,
        ...(m.note ? { note: m.note } : {}),
      });
    } else if (m && 'partial' in m) {
      pre.push({ name, quantity, unit, partial: m.reason });
    } else pre.push({ name, quantity, unit });
  }
  const toResolve = pre.filter((p) => !p.slug && !p.partial && p.name);
  const resolved = await ingredientResolver.resolveMany(
    toResolve.map((p) => ({ rawName: p.name, unit: p.unit })),
    ownerId,
    { candidates: false },
  );
  const resolvedRow = new Map(toResolve.map((p, i) => [p, resolved[i]?.match ?? null] as const));

  return pre.map((p): PlannedLine => {
    const { unit: canonical, note: unitNote } = normalizeRecipeUnit(p.unit);
    const row = p.slug ? (globalsBySlug.get(p.slug) ?? null) : (resolvedRow.get(p) ?? null);
    const notes = [p.note, unitNote].filter(Boolean);
    const base: RecipeLineWrite = {
      ingredientId: row?.id ?? null,
      rawName: p.name || '(unnamed)',
      quantity: Number.isFinite(p.quantity) ? p.quantity : 0,
      unit: canonical || p.unit,
      grams: null,
      note: notes.length ? notes.join('; ') : null,
      optional: false,
      ...(p.mirrorName ? { mirrorName: p.mirrorName } : {}),
      mirrorUnit: p.unit,
    };
    if (!row)
      return {
        write: base,
        row: null,
        issue: p.partial ? `partial: ${p.partial}` : 'no catalog match',
        ...(p.mapped ? { mapped: p.mapped } : {}),
      };
    const engineRow = toNutritionIngredient(row);
    if (!lineGrams({ quantity: base.quantity, unit: base.unit }, engineRow).problem)
      return { write: base, row, ...(p.mapped ? { mapped: p.mapped } : {}) };
    for (const sub of unitSubstitutes(p.unit, canonical, row)) {
      const candidate = { quantity: base.quantity * sub.factor, unit: sub.unit };
      if (!lineGrams(candidate, engineRow).problem) {
        return {
          write: {
            ...base,
            ...candidate,
            note: [base.note, `legacy unit: ${sub.policy}`].filter(Boolean).join('; '),
          },
          row,
          policy: sub.policy,
          ...(p.mapped ? { mapped: p.mapped } : {}),
        };
      }
    }
    const problem = lineGrams({ quantity: base.quantity, unit: base.unit }, engineRow).problem;
    return {
      write: base,
      row,
      issue: `${problem} for unit "${p.unit}" on ${row.slug}`,
      ...(p.mapped ? { mapped: p.mapped } : {}),
    };
  });
}

function pct(a: number, b: number): number {
  return b > 0 ? ((a - b) / b) * 100 : a > 0 ? 100 : 0;
}

async function main(): Promise<void> {
  const started = Date.now();
  // 1. global price rows → catalog
  const globals = await prisma.ingredientPrice.findMany({
    where: { creatorId: null, ingredientId: null },
    select: { ingredientName: true },
  });
  const linkRes = await ingredientResolver.resolveMany(
    globals.map((g) => ({ rawName: g.ingredientName })),
    null,
    { candidates: false },
  );
  let linked = 0;
  for (const [i, g] of globals.entries()) {
    const row = linkRes[i]?.match;
    if (!row) continue;
    linked += 1;
    if (!DRY_RUN)
      await prisma.ingredientPrice.update({
        where: { ingredientName: g.ingredientName },
        data: { ingredientId: row.id },
      });
  }
  // 2. private twins
  const owners = await prisma.ingredientPrice.findMany({
    where: { creatorId: { not: null } },
    select: { creatorId: true },
    distinct: ['creatorId'],
  });
  if (!DRY_RUN) for (const o of owners) if (o.creatorId) await ensurePrivateTwins(o.creatorId);

  // all global rows by slug (mapping targets)
  const catalogSlugs = readCatalogFile().map((e) => e.slug);
  const ids = await ingredientRepository.findGlobalIdsBySlugs(catalogSlugs);
  const globalRows = await ingredientRepository.findVisibleByIds([...ids.values()], null);
  const globalsBySlug = new Map(globalRows.map((r) => [r.slug, r]));
  if (globalsBySlug.size === 0)
    throw new Error('catalog not synced into this database — run pnpm ingredients:sync first');

  // 3. recipes
  // CURATED rows get their lines from the slug-carrying fixtures
  // (ensureCuratedRecipes); recipes that already have lines were written by the
  // new save paths. Both are skipped (the latter unless --force).
  const recipes = await prisma.recipe.findMany({
    where: { source: { not: 'CURATED' }, ...(FORCE ? {} : { lines: { none: {} } }) },
    select: {
      id: true,
      name: true,
      source: true,
      creatorId: true,
      servings: true,
      ingredients: true,
      nutritionInfo: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
    ...(Number.isFinite(LIMIT) ? { take: LIMIT } : {}),
  });
  type Row = {
    id: string;
    name: string;
    source: string;
    month: string;
    status: string;
    oldKcal: number;
    newKcal: number;
    issues: string[];
  };
  const rows: Row[] = [];
  const policyUse = new Map<string, number>();
  const mappingUse = new Map<string, number>();
  const missingPairs = new Map<string, number>();
  for (const r of recipes) {
    const json = Array.isArray(r.ingredients) ? (r.ingredients as JsonLine[]) : [];
    const planned = await planRecipe(json, r.creatorId, globalsBySlug);
    const { result } = await recipeNutritionService.compute(
      planned.map((p) => p.write),
      r.creatorId,
      r.servings,
    );
    const writes = planned.map((p, i) => ({ ...p.write, grams: result.lines[i]?.grams ?? null }));
    const old = (r.nutritionInfo ?? {}) as Partial<NutritionFacts>;
    const oldKcal = typeof old.calories === 'number' ? old.calories : 0;
    const keepTyped = result.status !== 'COMPUTED' && r.source === 'MANUAL' && oldKcal > 0;
    const status = keepTyped ? 'USER_ENTERED' : result.status;
    const perServing: NutritionFacts = keepTyped
      ? {
          calories: oldKcal,
          protein: old.protein ?? 0,
          carbs: old.carbs ?? 0,
          fat: old.fat ?? 0,
          fiber: old.fiber ?? 0,
        }
      : result.perServing;
    for (const p of planned) {
      if (p.policy) policyUse.set(p.policy, (policyUse.get(p.policy) ?? 0) + 1);
      if (p.mapped) mappingUse.set(p.mapped, (mappingUse.get(p.mapped) ?? 0) + 1);
      if (p.issue) {
        const key = `${normalizeIngredientName(p.write.rawName)} | ${p.write.mirrorUnit ?? p.write.unit} | ${p.issue}`;
        missingPairs.set(key, (missingPairs.get(key) ?? 0) + 1);
      }
    }
    rows.push({
      id: r.id,
      name: r.name,
      source: r.source,
      month: r.createdAt.toISOString().slice(0, 7),
      status,
      oldKcal,
      newKcal: perServing.calories,
      issues: planned
        .filter((p) => p.issue)
        .map((p) => `${p.write.rawName} (${p.write.mirrorUnit}): ${p.issue}`),
    });
    if (!DRY_RUN) {
      await recipeLineRepository.writeLines(r.id, writes, {
        status,
        perServing,
        total: keepTyped ? null : result.total,
      });
    }
  }

  // 4. report
  const bySourceStatus: Record<string, Record<string, number>> = {};
  for (const r of rows) {
    const bucket = (bySourceStatus[r.source] ??= {});
    bucket[r.status] = (bucket[r.status] ?? 0) + 1;
  }
  const changed = rows
    .filter((r) => r.status === 'COMPUTED' && r.oldKcal > 0)
    .map((r) => ({ ...r, change: pct(r.newKcal, r.oldKcal) }));
  const sorted = [...changed].map((r) => r.change).sort((a, b) => a - b);
  const q = (p: number) =>
    sorted.length ? Math.round(sorted[Math.floor(p * (sorted.length - 1))] ?? 0) : 0;
  const computed = rows.filter((r) => r.status === 'COMPUTED').length;
  const report = {
    dryRun: DRY_RUN,
    ms: Date.now() - started,
    priceRowsLinked: linked,
    privateOwners: owners.length,
    recipes: rows.length,
    computed,
    computedPct: rows.length ? Math.round((1000 * computed) / rows.length) / 10 : 0,
    bySourceStatus,
    kcalChange: {
      n: sorted.length,
      p10: q(0.1),
      median: q(0.5),
      p90: q(0.9),
      p95: q(0.95),
      min: q(0),
      max: q(1),
    },
    // By creation month: tells old generator eras (whose numbers drifted from
    // their quantities) apart from recent ones.
    kcalChangeByMonth: Object.fromEntries(
      [...new Set(changed.map((r) => r.month))].sort().map((m) => {
        const xs = changed
          .filter((r) => r.month === m)
          .map((r) => r.change)
          .sort((a, b) => a - b);
        return [m, { n: xs.length, median: Math.round(xs[Math.floor((xs.length - 1) / 2)] ?? 0) }];
      }),
    ),
    largestChanges: [...changed]
      .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
      .slice(0, 20)
      .map((r) => ({
        id: r.id,
        name: r.name,
        source: r.source,
        oldKcal: r.oldKcal,
        newKcal: r.newKcal,
        changePct: Math.round(r.change),
      })),
    notComputed: rows
      .filter((r) => r.status !== 'COMPUTED')
      .map((r) => ({
        id: r.id,
        name: r.name,
        source: r.source,
        status: r.status,
        issues: r.issues,
      })),
    unitPolicyUse: Object.fromEntries([...policyUse].sort((a, b) => b[1] - a[1])),
    mappingUse: Object.fromEntries([...mappingUse].sort((a, b) => b[1] - a[1])),
    unresolvedPairs: Object.fromEntries([...missingPairs].sort((a, b) => b[1] - a[1])),
  };
  mkdirSync(REPORT_DIR, { recursive: true });
  writeFileSync(join(REPORT_DIR, 'migrate-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    `[ingredients:migrate]${DRY_RUN ? ' (dry run)' : ''} ${rows.length} recipes: ${computed} COMPUTED (${report.computedPct}%), ` +
      `${JSON.stringify(bySourceStatus)}; kcal change median ${report.kcalChange.median}%, p10 ${report.kcalChange.p10}%, p90 ${report.kcalChange.p90}%; ` +
      `${linked} price rows linked; report → ${join(REPORT_DIR, 'migrate-report.json')} (${report.ms} ms)`,
  );
}

main()
  .catch((err: unknown) => {
    console.error('[ingredients:migrate] failed:', err);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
