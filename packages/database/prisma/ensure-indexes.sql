-- Indexes Prisma's schema can't express (partial indexes). Deploys apply the
-- schema with `prisma db push`, which never runs migration files, so the
-- deploy's migrate step runs this file right after the push (db push leaves an
-- existing partial index alone — verified 2026-10-04). Idempotent: safe on every
-- deploy and on a fresh database.

-- WP-18: a client has at most one ACTIVE trainer link. The join transaction
-- ends the old link first; this index is the database-level backstop.
CREATE UNIQUE INDEX IF NOT EXISTS "coaching_links_one_active_trainer"
  ON "coaching_links" ("clientId")
  WHERE "status" = 'ACTIVE';
