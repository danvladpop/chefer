/**
 * `pnpm ingredients:sync [--dry-run]` — upserts data/ingredients/catalog.json
 * into the database (docs/plan-ingredient-catalog.md §4.4 step 7). Runs on every
 * deploy right after `prisma db push` (docker-compose.deploy.yml `migrate`).
 * Exits non-zero on a validator error or a failed write, which fails the deploy
 * the same way a failed `db push` does.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from '../client';
import { applyCatalogSync, CatalogValidationError } from './sync';
import type { CatalogEntry } from './validate';

const CATALOG_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../data/ingredients/catalog.json',
);

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const entries = JSON.parse(readFileSync(CATALOG_PATH, 'utf8')) as CatalogEntry[];
  const started = Date.now();
  const r = await applyCatalogSync(prisma, entries, { dryRun });
  console.log(
    `[catalog-sync]${r.dryRun ? ' (dry run)' : ''} ${r.rows} rows: ` +
      `${r.created} created, ${r.updated} updated, ${r.unchanged} unchanged, ` +
      `${r.deprecated.length} deprecated, ${r.removed.length} removed; ` +
      `aliases +${r.aliases.created}/-${r.aliases.deleted}; ` +
      `portions +${r.portions.created}/~${r.portions.updated}/-${r.portions.deleted}; ` +
      `${r.warnings} validator warnings; ${Date.now() - started} ms`,
  );
  if (r.deprecated.length > 0) console.log(`[catalog-sync] deprecated: ${r.deprecated.join(', ')}`);
  if (r.removed.length > 0) console.log(`[catalog-sync] removed: ${r.removed.join(', ')}`);
}

main()
  .catch((err: unknown) => {
    if (err instanceof CatalogValidationError) console.error(`[catalog-sync] ${err.message}`);
    else console.error('[catalog-sync] failed:', err);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
