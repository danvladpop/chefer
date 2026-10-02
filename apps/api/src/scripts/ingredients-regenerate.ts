/**
 * `pnpm --filter @chefer/api ingredients:regenerate [--report-dir DIR] [--limit N]`
 * `pnpm --filter @chefer/api ingredients:regenerate --apply-fixes FILE [--dry-run]`
 *
 * Owner decision 2026-10-02: AI recipes still PARTIAL after the §7 migration
 * get their bad lines regenerated (legacy-regenerate.service.ts).
 *   1. Without --apply-fixes it PROPOSES: one AI call per 40 lines (the
 *      environment's real provider), every answer checked by repair-guard.ts.
 *      It writes regenerate-proposals.json and changes nothing.
 *   2. A person reviews the file, deleting any fix that is wrong.
 *   3. --apply-fixes FILE writes exactly the fixes left in FILE (re-checked,
 *      recomputed, no AI call). Add --dry-run to preview.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { prisma } from '@chefer/database';
import {
  legacyRecipeRegenerator,
  type LineFix,
} from '../application/ingredients/legacy-regenerate.service.js';

const args = process.argv.slice(2);
const arg = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const FIXES_FILE = arg('--apply-fixes');
const DRY_RUN = args.includes('--dry-run');
const LIMIT = arg('--limit') ? Number(arg('--limit')) : undefined;
const REPORT_DIR = arg('--report-dir') ?? 'ingredients-regenerate-report';

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
  mkdirSync(REPORT_DIR, { recursive: true });

  if (!FIXES_FILE) {
    const outcomes = await legacyRecipeRegenerator.propose(recipes);
    const fixes = outcomes.flatMap((o) => o.fixes);
    const file = join(REPORT_DIR, 'regenerate-proposals.json');
    writeFileSync(file, `${JSON.stringify({ fixes, outcomes }, null, 2)}\n`);
    const computed = outcomes.filter((o) => o.status === 'COMPUTED').length;
    console.log(
      `[ingredients:regenerate] PROPOSED (nothing written): ${outcomes.length} PARTIAL AI recipes, ` +
        `${fixes.length} line fixes would make ${computed} compute; ` +
        `${outcomes.reduce((s, o) => s + o.rejected.length, 0)} proposals rejected by the guard, ` +
        `${outcomes.reduce((s, o) => s + o.skipped.length, 0)} lines skipped on purpose → ${file}`,
    );
    return;
  }

  const reviewed = (JSON.parse(readFileSync(FIXES_FILE, 'utf8')) as { fixes: LineFix[] }).fixes;
  const outcomes = await legacyRecipeRegenerator.applyFixes(recipes, reviewed, { dryRun: DRY_RUN });
  const file = join(REPORT_DIR, 'regenerate-applied.json');
  writeFileSync(file, `${JSON.stringify({ dryRun: DRY_RUN, outcomes }, null, 2)}\n`);
  console.log(
    `[ingredients:regenerate]${DRY_RUN ? ' (dry run)' : ''} applied ` +
      `${outcomes.reduce((s, o) => s + o.fixes.length, 0)} of ${reviewed.length} reviewed fixes to ` +
      `${outcomes.length} recipes: ${outcomes.filter((o) => o.status === 'COMPUTED').length} now compute; ` +
      `${outcomes.reduce((s, o) => s + o.rejected.length, 0)} refused → ${file}`,
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
