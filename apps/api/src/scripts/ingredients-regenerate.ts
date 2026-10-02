/**
 * `pnpm --filter @chefer/api ingredients:regenerate [--apply] [--limit N] [--report-dir DIR]`
 *
 * Owner decision 2026-10-02: AI recipes still PARTIAL after the §7 migration
 * get their bad lines regenerated (legacy-regenerate.service.ts): the AI names
 * a catalog slug and amount per line, the server recomputes. DRY RUN unless
 * `--apply`; a dry run still calls the AI (about one call per 40 lines).
 * Uses the real AI provider of the environment it runs in.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { prisma } from '@chefer/database';
import { legacyRecipeRegenerator } from '../application/ingredients/legacy-regenerate.service.js';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const LIMIT = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : undefined;
const reportArg = args.indexOf('--report-dir');
const REPORT_DIR =
  (reportArg >= 0 ? args[reportArg + 1] : undefined) ?? 'ingredients-regenerate-report';

async function main(): Promise<void> {
  const recipes = await prisma.recipe.findMany({
    where: { source: 'AI', nutritionStatus: 'PARTIAL', lines: { some: {} } },
    select: {
      id: true,
      name: true,
      creatorId: true,
      servings: true,
      ingredients: true,
      nutritionInfo: true,
      lines: { orderBy: { position: 'asc' } },
    },
    orderBy: { createdAt: 'asc' },
    ...(LIMIT ? { take: LIMIT } : {}),
  });
  const outcomes = await legacyRecipeRegenerator.regenerate(recipes, { dryRun: !APPLY });
  const computed = outcomes.filter((o) => o.status === 'COMPUTED').length;
  mkdirSync(REPORT_DIR, { recursive: true });
  writeFileSync(
    join(REPORT_DIR, 'regenerate-report.json'),
    `${JSON.stringify({ apply: APPLY, recipes: outcomes.length, computed, outcomes }, null, 2)}\n`,
  );
  console.log(
    `[ingredients:regenerate]${APPLY ? '' : ' (dry run — pass --apply to write)'} ` +
      `${outcomes.length} PARTIAL AI recipes: ${computed} now compute, ` +
      `${outcomes.length - computed} still PARTIAL; report → ${join(REPORT_DIR, 'regenerate-report.json')}`,
  );
}

main()
  .catch((err: unknown) => {
    console.error('[ingredients:regenerate] failed:', err);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
