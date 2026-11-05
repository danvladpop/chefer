import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from '@chefer/database';
import { recipeTranslationService } from '../application/recipe/recipe-translation.service.js';
import { ensureCuratedRecipes } from '../lib/curated-recipes/index.js';
import { env } from '../lib/env.js';

// ─── Curated recipe translations (Lane J phase 3, ADR 0004) ───────────────────
// Dev/ops only — there is deliberately no API procedure for this. Drafts the
// display text of every curated recipe in Romanian with the AI, keeps it in
// recipe_translations as MACHINE_DRAFT, and lets a person approve it.
//
//   pnpm recipes:translate [--limit=N] [--recipe=<id>]… [--dry-run] [--force]
//   pnpm recipes:translate sheet      # writes docs/i18n/recipes-ro-review.md
//   pnpm recipes:translate approve <recipeId>… | --all
//
// Only recipes with no translation, or whose English changed since, are sent
// (--force redoes them all). One AI call per recipe, with the `cheferize`
// route; AI_MOCK_ENABLED=true (the worktree default) writes "[ro] …" stand-ins
// so the flow can be tested without a provider. The real run is an owner
// action: it spends AI calls (about one per curated recipe).

const LOCALE = 'ro' as const;

async function translate(flags: string[]): Promise<void> {
  const dryRun = flags.includes('--dry-run');
  const force = flags.includes('--force');
  const limitFlag = flags.find((f) => f.startsWith('--limit='));
  const limit = limitFlag ? Number(limitFlag.slice('--limit='.length)) : undefined;
  const recipeIds = flags.filter((f) => f.startsWith('--recipe=')).map((f) => f.slice(9));
  if (limit !== undefined && !(Number.isInteger(limit) && limit > 0)) {
    throw new Error('--limit must be a positive whole number');
  }

  // The pool is code (lib/curated-recipes); make sure every row exists first.
  await ensureCuratedRecipes();
  console.log(
    `Translating curated recipes into ${LOCALE}${env.AI_MOCK_ENABLED ? ' with the MOCK AI ([ro] stand-ins)' : ''}…`,
  );
  const result = await recipeTranslationService.translatePending({
    locale: LOCALE,
    dryRun,
    force,
    ...(limit !== undefined && { limit }),
    ...(recipeIds.length > 0 && { recipeIds }),
    onProgress: (id, outcome) => console.log(`  ${outcome === 'translated' ? '✓' : '✗'} ${id}`),
  });
  for (const failure of result.failed) console.error(`  ✗ ${failure.recipeId}: ${failure.error}`);
  console.log(
    `${dryRun ? 'Would translate' : 'Translated'} ${result.translated.length}, already current ${result.current}, failed ${result.failed.length}.`,
  );
  if (result.failed.length > 0) process.exitCode = 1;
}

async function sheet(): Promise<void> {
  const out = resolve(
    dirname(fileURLToPath(import.meta.url)),
    `../../../../docs/i18n/recipes-${LOCALE}-review.md`,
  );
  writeFileSync(out, await recipeTranslationService.reviewSheet(LOCALE));
  console.log(`Wrote ${out}`);
}

async function approve(args: string[]): Promise<void> {
  let ids = args.filter((a) => !a.startsWith('--'));
  if (args.includes('--all')) {
    ids = (
      await prisma.recipeTranslation.findMany({
        where: { locale: LOCALE, status: 'MACHINE_DRAFT' },
        select: { recipeId: true },
      })
    ).map((t) => t.recipeId);
  }
  if (ids.length === 0) throw new Error('Name the recipe ids to approve, or pass --all');
  const count = await recipeTranslationService.approve(ids, LOCALE);
  console.log(`Marked ${count} translation(s) REVIEWED.`);
}

async function main(): Promise<void> {
  const [first, ...rest] = process.argv.slice(2);
  if (first === 'sheet') return sheet();
  if (first === 'approve') return approve(rest);
  return translate(first ? [first, ...rest] : rest);
}

main()
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
