import { describe, expect, it } from 'vitest';
import { findUnsafeStatements, splitStatements } from './schema-diff-guard';

// Verbatim `prisma migrate diff --script` output for the 2026-10-24 batch
// (ebdf2ea4 → 8cafd6ee), trimmed to one of each statement shape.
const BATCH_2026_10_24 = `-- CreateEnum
CREATE TYPE "WeightSource" AS ENUM ('MANUAL', 'APPLE_HEALTH', 'HEALTH_CONNECT');

-- AlterEnum
ALTER TYPE "ConsentKind" ADD VALUE 'HEALTH_SYNC';

-- AlterTable
ALTER TABLE "chef_reviews" ADD COLUMN     "explanation" JSONB;

-- AlterTable
ALTER TABLE "weight_entries" ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "source" "WeightSource" NOT NULL DEFAULT 'MANUAL';

-- CreateTable
CREATE TABLE "body_measurements" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "measuredOn" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "body_measurements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "weight_entries_userId_externalId_key" ON "weight_entries"("userId", "externalId");

-- CreateIndex
CREATE INDEX "curated_recipe_drafts_submittedAt_idx" ON "curated_recipe_drafts"("submittedAt");

-- AddForeignKey
ALTER TABLE "body_measurements" ADD CONSTRAINT "body_measurements_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
`;

const reasons = (sql: string) => findUnsafeStatements(sql).map((r) => r.reason);

describe('findUnsafeStatements', () => {
  it('lets the 2026-10-24 batch through (unique index over a new nullable column)', () => {
    expect(findUnsafeStatements(BATCH_2026_10_24)).toEqual([]);
  });

  it('lets an empty diff through', () => {
    expect(findUnsafeStatements('-- This is an empty migration.\n')).toEqual([]);
  });

  it('allows relaxing constraints and changing defaults', () => {
    const sql = `-- DropForeignKey
ALTER TABLE "a" DROP CONSTRAINT "a_userId_fkey";

-- DropIndex
DROP INDEX "a_slug_key";

-- AlterTable
ALTER TABLE "a" ALTER COLUMN "note" DROP NOT NULL,
ALTER COLUMN "kind" SET DEFAULT 'X',
ALTER COLUMN "old" DROP DEFAULT;

-- RenameIndex
ALTER INDEX "a_x_idx" RENAME TO "a_y_idx";
`;
    expect(findUnsafeStatements(sql)).toEqual([]);
  });

  it('refuses a dropped table, column or enum', () => {
    const sql = `-- DropTable
DROP TABLE "legacy";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "nickname",
ADD COLUMN     "bio" TEXT;

-- DropEnum
DROP TYPE "OldKind";
`;
    expect(findUnsafeStatements(sql)).toEqual([
      { statement: 'DROP TABLE "legacy"', reason: 'drops a table' },
      { statement: 'ALTER TABLE "users" DROP COLUMN "nickname"', reason: 'drops a column' },
      { statement: 'DROP TYPE "OldKind"', reason: 'drops an enum' },
    ]);
  });

  it('refuses type changes, including the enum-value-removal recreate', () => {
    expect(reasons(`ALTER TABLE "a" ALTER COLUMN "n" SET DATA TYPE INTEGER;`)).toEqual([
      "changes a column's type",
    ]);
    const enumRemoval = `-- AlterEnum
BEGIN;
CREATE TYPE "Kind_new" AS ENUM ('A');
ALTER TABLE "a" ALTER COLUMN "kind" TYPE "Kind_new" USING ("kind"::text::"Kind_new");
ALTER TYPE "Kind" RENAME TO "Kind_old";
ALTER TYPE "Kind_new" RENAME TO "Kind";
DROP TYPE "Kind_old";
COMMIT;
`;
    expect(reasons(enumRemoval)).toEqual([
      'not a known-safe statement',
      "changes a column's type",
      'not a known-safe statement',
      'not a known-safe statement',
      'drops an enum',
      'not a known-safe statement',
    ]);
  });

  it('refuses making a column required, or adding one with no default', () => {
    expect(reasons(`ALTER TABLE "a" ALTER COLUMN "n" SET NOT NULL;`)).toEqual([
      'makes an existing column required',
    ]);
    expect(reasons(`ALTER TABLE "a" ADD COLUMN     "n" TEXT NOT NULL;`)).toEqual([
      'adds a required column without a default',
    ]);
  });

  it('refuses statements it does not recognise', () => {
    expect(reasons(`TRUNCATE "a";`)).toEqual(['not a known-safe statement']);
    expect(reasons(`ALTER TABLE "a" RENAME COLUMN "x" TO "y";`)).toEqual([
      'not a known-safe table change',
    ]);
  });
});

describe('splitStatements', () => {
  it('drops comments and keeps multi-line statements whole', () => {
    expect(splitStatements(BATCH_2026_10_24)).toHaveLength(8);
  });
});
