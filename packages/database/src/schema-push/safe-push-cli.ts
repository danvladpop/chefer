/**
 * `pnpm db:push:safe` — the deploy's schema step (docker-compose.deploy.yml
 * `migrate`). Computes the SQL that would bring the live database to
 * prisma/schema.prisma, refuses it if any statement could destroy or rewrite
 * data (schema-diff-guard.ts), and otherwise applies it with
 * `prisma db push --accept-data-loss`, so additive changes Prisma merely warns
 * about (e.g. a unique index over a new nullable column) no longer stop a deploy.
 *
 * A refusal exits non-zero, which fails the deploy before api/web are touched
 * (infrastructure/scripts/deploy.sh). Apply a refused change by hand after
 * reviewing it — infrastructure.md §12 "Schema changes on deploy".
 */
import { spawnSync } from 'node:child_process';
import { findUnsafeStatements } from './schema-diff-guard';

const SCHEMA = 'prisma/schema.prisma';

function prisma(args: string[], capture: boolean): string {
  const r = spawnSync('npx', ['prisma', ...args], {
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
  });
  if (r.status !== 0)
    throw new Error(`prisma ${args.slice(0, 2).join(' ')} exited with ${String(r.status)}`);
  return r.stdout;
}

function main(): void {
  // --from-schema-datasource reads the live database from the schema's
  // datasource (DATABASE_URL), the same database db push writes to.
  const sql = prisma(
    [
      'migrate',
      'diff',
      '--from-schema-datasource',
      SCHEMA,
      '--to-schema-datamodel',
      SCHEMA,
      '--script',
    ],
    true,
  );
  console.log(`[safe-push] pending schema change:\n${sql.trim()}`);

  const refused = findUnsafeStatements(sql);
  if (refused.length > 0) {
    console.error('[safe-push] REFUSED — these statements could destroy or rewrite data:');
    for (const r of refused) console.error(`  - ${r.reason}: ${r.statement}`);
    console.error(
      '[safe-push] Nothing was applied. Review and apply by hand (infrastructure.md §12).',
    );
    process.exitCode = 1;
    return;
  }

  prisma(['db', 'push', '--skip-generate', '--accept-data-loss', '--schema', SCHEMA], false);
}

try {
  main();
} catch (err: unknown) {
  console.error('[safe-push] failed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
}
