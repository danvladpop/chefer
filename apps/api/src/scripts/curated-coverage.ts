/**
 * curated-coverage.ts
 *
 * Prints the curated free pool's coverage report (market review F2) as
 * Markdown: counts by meal type, diet, allergen-free class, prep time and
 * cuisine, the effective pool per common household profile, and the cells
 * that repeat within 2–4 weeks. Same numbers as the admin page
 * (/admin/recipes/coverage), computed the way users are served.
 *
 * The authored fixtures always count; approved ingested recipes are added when
 * DATABASE_URL reaches a database (otherwise a warning, fixtures only).
 *
 * Usage (from apps/api, or `pnpm recipes:coverage` at the root):
 *   pnpm recipes:coverage            # Markdown to stdout
 *   pnpm recipes:coverage --json     # the raw report
 */

import { curatedRecipeDraftRepository, prisma } from '@chefer/database';
import { buildCoverageReport, COVERAGE_MEAL_TYPES } from '../lib/curated-recipes/coverage.js';
import {
  curatedPoolByType,
  ingestedCuratedPools,
  setIngestedCuratedRecipes,
} from '../lib/curated-recipes/index.js';

type Row = { label: string; counts: Record<string, number> };

function table(title: string, rows: Row[], extra?: (r: Row) => string): string {
  const head = `| ${title} | ${COVERAGE_MEAL_TYPES.join(' | ')} |${extra ? ' Total |' : ''}`;
  const sep = `|---|${COVERAGE_MEAL_TYPES.map(() => '---:').join('|')}|${extra ? '---:|' : ''}`;
  const body = rows.map(
    (r) =>
      `| ${r.label} | ${COVERAGE_MEAL_TYPES.map((t) => r.counts[t] ?? 0).join(' | ')} |${extra ? ` ${extra(r)} |` : ''}`,
  );
  return [head, sep, ...body].join('\n');
}

async function main(): Promise<void> {
  try {
    setIngestedCuratedRecipes(await curatedRecipeDraftRepository.findApproved());
  } catch (err) {
    console.error(
      `(no database: fixtures only — ${err instanceof Error ? err.message.split('\n')[0] : String(err)})`,
    );
  }
  const ingested = new Set(
    Object.values(ingestedCuratedPools())
      .flat()
      .map((r) => r.id),
  );
  const report = buildCoverageReport(curatedPoolByType(), ingested);

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const out = [
    `# Curated pool coverage`,
    '',
    `${report.total} recipes (${report.ingested} ingested). A meal type is eaten once a day, so a pool of N repeats within N ÷ 7 weeks.`,
    '',
    table('Meal type', [{ label: 'All recipes', counts: report.byMealType }]),
    '',
    '## Effective pool per household profile',
    '',
    table('Profile', report.profiles),
    '',
    '## Thin spots (repeats within 4 weeks)',
    '',
    '| Profile | Meal | Pool | Weeks before a repeat |',
    '|---|---|---:|---:|',
    ...report.thinSpots.map(
      (t) => `| ${t.profileLabel} | ${t.mealType} | ${t.poolSize} | ${t.weeksBeforeRepeat} |`,
    ),
    '',
    '## Diets (as served)',
    '',
    table('Diet', report.byDiet),
    '',
    '## Allergen-free',
    '',
    table('Free from', report.byAllergenFree),
    '',
    '## Prep + cook time',
    '',
    table('Band', report.byPrepTime),
    '',
    '## Cuisine',
    '',
    table('Cuisine', report.byCuisine, (r) => String((r as { total?: number }).total ?? '')),
  ];
  console.log(out.join('\n'));
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
