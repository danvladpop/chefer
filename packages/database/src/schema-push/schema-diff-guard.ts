/**
 * Decides whether a schema change is safe to apply unattended on deploy.
 *
 * Deploys apply the schema with `prisma db push`, which refuses any change it
 * warns about unless given `--accept-data-loss`. Some of those warnings are
 * false alarms for us — a unique index over a brand-new nullable column can't
 * collide, yet it stopped the 2026-10-24 deploy. This guard reads the SQL
 * `prisma migrate diff` would run and allows only statement shapes that never
 * destroy or rewrite stored data; anything else (including anything it doesn't
 * recognise) is refused, so `--accept-data-loss` is only ever passed for
 * changes that are additive.
 *
 * Allowed: CREATE TABLE / INDEX / ENUM, ALTER TYPE … ADD VALUE, DROP INDEX,
 * ALTER INDEX … RENAME, and ALTER TABLE actions ADD COLUMN (nullable or with a
 * DEFAULT), ADD/DROP/RENAME CONSTRAINT, ALTER COLUMN … DROP NOT NULL / SET
 * DEFAULT / DROP DEFAULT. Indexes and constraints hold no data, so dropping one
 * loses nothing; adding one may fail on existing rows, which fails the deploy.
 */

export type RefusedStatement = { statement: string; reason: string };

const ALLOWED_STATEMENTS: RegExp[] = [
  /^CREATE TABLE /i,
  /^CREATE (UNIQUE )?INDEX /i,
  /^CREATE TYPE \S+ AS ENUM /i,
  /^ALTER TYPE \S+ ADD VALUE /i,
  /^DROP INDEX /i,
  /^ALTER INDEX \S+ RENAME TO /i,
];

const ALLOWED_TABLE_ACTIONS: RegExp[] = [
  /^ADD CONSTRAINT /i,
  /^DROP CONSTRAINT /i,
  /^RENAME CONSTRAINT /i,
  /^ALTER COLUMN \S+ DROP NOT NULL$/i,
  /^ALTER COLUMN \S+ SET DEFAULT /i,
  /^ALTER COLUMN \S+ DROP DEFAULT$/i,
];

const collapse = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** Splits a `migrate diff --script` output into statements, comments removed. */
export function splitStatements(sql: string): string[] {
  const withoutComments = sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');
  // Prisma ends every statement with `;` at the end of a line.
  return withoutComments
    .split(/;[ \t]*(?:\n|$)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function checkTableAction(action: string): string | null {
  const a = collapse(action);
  if (/^ADD COLUMN /i.test(a)) {
    // A required column with no default can't be filled in for existing rows.
    return /\bNOT NULL\b/i.test(a) && !/\bDEFAULT\b/i.test(a)
      ? 'adds a required column without a default'
      : null;
  }
  if (ALLOWED_TABLE_ACTIONS.some((re) => re.test(a))) return null;
  if (/^DROP COLUMN /i.test(a)) return 'drops a column';
  if (/^ALTER COLUMN \S+ (SET DATA )?TYPE /i.test(a)) return "changes a column's type";
  if (/^ALTER COLUMN \S+ SET NOT NULL$/i.test(a)) return 'makes an existing column required';
  return 'not a known-safe table change';
}

/** Returns every statement in `sql` that is not known to be additive. */
export function findUnsafeStatements(sql: string): RefusedStatement[] {
  const refused: RefusedStatement[] = [];
  for (const statement of splitStatements(sql)) {
    const s = collapse(statement);
    if (ALLOWED_STATEMENTS.some((re) => re.test(s))) continue;

    const table = /^ALTER TABLE (\S+) ([\s\S]*)$/i.exec(statement.trim());
    if (table?.[2] !== undefined) {
      // Prisma puts each action of a multi-action ALTER TABLE on its own line.
      for (const action of table[2].split(/,[ \t]*\n/)) {
        const reason = checkTableAction(action);
        if (reason)
          refused.push({ statement: `ALTER TABLE ${table[1]} ${collapse(action)}`, reason });
      }
      continue;
    }

    if (/^DROP TABLE /i.test(s)) refused.push({ statement: s, reason: 'drops a table' });
    else if (/^DROP TYPE /i.test(s)) refused.push({ statement: s, reason: 'drops an enum' });
    else refused.push({ statement: s, reason: 'not a known-safe statement' });
  }
  return refused;
}
