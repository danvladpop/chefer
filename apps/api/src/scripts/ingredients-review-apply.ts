/**
 * `pnpm --filter @chefer/api ingredients:review-apply <decisions.json> [--apply]`
 *
 * plan-ingredient-catalog §8.2: carries out a weekly review's decisions file
 * (MAP / PROMOTE / KEEP / REJECT_DATA, schema in ingredient-review.service.ts).
 * DRY RUN unless `--apply` is passed (safer than the plan's `--dry-run` opt-in).
 * Run it only after any PROMOTE rows have shipped in catalog.json and synced.
 * Idempotent: re-running skips rows already merged. Prints a diff summary,
 * e.g. "3 merged, 37 recipes recomputed, max kcal change −12%".
 */
import { readFileSync } from 'node:fs';
import { prisma } from '@chefer/database';
import {
  ingredientReviewService,
  reviewDecisionsFileSchema,
} from '../application/ingredients/ingredient-review.service.js';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const APPLY = args.includes('--apply');

async function main(): Promise<void> {
  if (!file) throw new Error('usage: ingredients:review-apply <decisions.json> [--apply]');
  const decisions = reviewDecisionsFileSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
  const outcomes = await ingredientReviewService.apply(decisions, { dryRun: !APPLY });
  let merged = 0;
  const changes: number[] = [];
  for (const o of outcomes) {
    merged += o.merged.length;
    console.log(
      `${o.decision}${o.target ? ` → ${o.target}` : ''}: ${o.merged.length} merged` +
        (o.skipped.length
          ? `, skipped ${o.skipped.map((s) => `${s.id} (${s.why})`).join('; ')}`
          : '') +
        (o.recipes.length ? `, ${o.recipes.length} recipe(s) recomputed` : ''),
    );
    for (const n of o.notes) console.log(`  note: ${n}`);
    for (const r of o.recipes)
      if (r.oldKcal && r.newKcal !== null)
        changes.push(((r.newKcal - r.oldKcal) / r.oldKcal) * 100);
  }
  const max = changes.reduce((m, c) => (Math.abs(c) > Math.abs(m) ? c : m), 0);
  console.log(
    `[ingredients:review-apply]${APPLY ? '' : ' (dry run — pass --apply to write)'} ` +
      `${decisions.decisions.length} decisions, ${merged} ${APPLY ? 'merged' : 'would merge'}, ` +
      `${changes.length} recipes recomputed, max kcal change ${Math.round(max)}%`,
  );
}

main()
  .catch((err: unknown) => {
    console.error('[ingredients:review-apply] failed:', err);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
