/**
 * `pnpm --filter @chefer/api ingredients:review-report [--since YYYY-MM-DD] [--out DIR]`
 *
 * plan-ingredient-catalog §8.2: the weekly private-ingredient review. Read-only.
 * Lists every ACTIVE private ingredient created, edited or used since
 * `--since` (default: 7 days ago) with the resolver's top global candidates,
 * a nutrition delta, the merge-tolerance verdict and §4.5 sanity flags, plus
 * clusters of the same name across users. Writes review-<today>.md and .json
 * to scripts/ingredients/out/ (git-ignored). User ids only — no emails.
 * The database is whatever DATABASE_URL points at (see the runbook for prod).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from '@chefer/database';
import { ingredientReviewService } from '../application/ingredients/ingredient-review.service.js';

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const since = arg('--since')
  ? new Date(`${arg('--since')}T00:00:00Z`)
  : new Date(Date.now() - 7 * 24 * 3600 * 1000);
const OUT = resolve(
  arg('--out') ?? fileURLToPath(new URL('../../../../scripts/ingredients/out', import.meta.url)),
);

async function main(): Promise<void> {
  if (Number.isNaN(since.getTime())) throw new Error('--since must be YYYY-MM-DD');
  const report = await ingredientReviewService.buildReport(since);
  const today = new Date().toISOString().slice(0, 10);
  mkdirSync(OUT, { recursive: true });
  const base = join(OUT, `review-${today}`);
  writeFileSync(`${base}.json`, `${JSON.stringify(report, null, 2)}\n`);

  const md: string[] = [
    `# Private-ingredient review ${today}`,
    '',
    `Since ${report.since}: ${report.items.length} private ingredients, ${report.clusters.length} distinct names.`,
    `Decisions go in \`review-${today}.decisions.json\` (runbook: docs/runbooks/ingredient-weekly-review.md).`,
    '',
    '## Clusters (same name across users)',
    '',
    '| name | users | recipes | ids |',
    '| --- | --- | --- | --- |',
    ...report.clusters.map(
      (c) => `| ${c.key} | ${c.users} | ${c.recipes} | ${c.privateIds.join(', ')} |`,
    ),
    '',
    '## Ingredients',
  ];
  for (const it of report.items) {
    const m = it.userMacros;
    md.push(
      '',
      `### ${it.name} — \`${it.id}\``,
      '',
      `owner \`${it.ownerId}\` · ${it.category} · ${it.recipeCount} recipe(s) · created ${it.createdAt.slice(0, 10)}`,
      `user values /100 g (hint only): ${m.kcal} kcal, P ${m.protein}, C ${m.carbs}, F ${m.fat}, fiber ${m.fiber}` +
        (it.portions.length
          ? ` · portions ${it.portions.map((p) => `${p.unit}=${p.grams} g`).join(', ')}`
          : '') +
        (it.densityGPerMl ? ` · density ${it.densityGPerMl} g/ml` : ''),
    );
    if (it.sanity.length) md.push(`⚠ ${it.sanity.join('; ')}`);
    if (it.candidates.length === 0) md.push('no global candidate');
    for (const c of it.candidates) {
      const d = c.delta;
      md.push(
        `- ${c.confidence} \`${c.slug}\` (${c.name}): Δ kcal ${d.kcal}%, P ${d.protein}%, C ${d.carbs}%, F ${d.fat}% — ` +
          (c.toleranceProblem ? `outside tolerance (${c.toleranceProblem})` : 'within tolerance'),
      );
    }
  }
  writeFileSync(`${base}.md`, `${md.join('\n')}\n`);
  console.log(
    `[ingredients:review-report] ${report.items.length} private ingredients since ${report.since}, ` +
      `${report.clusters.filter((c) => c.users > 1).length} names shared by several users → ${base}.md`,
  );
}

main()
  .catch((err: unknown) => {
    console.error('[ingredients:review-report] failed:', err);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
