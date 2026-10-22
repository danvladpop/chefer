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

-- WP-18 phase 1: a client has at most one PENDING coaching request. The request
-- transaction expires a stale one first; this index is the backstop.
CREATE UNIQUE INDEX IF NOT EXISTS "coaching_requests_one_pending"
  ON "coaching_requests" ("clientId")
  WHERE "status" = 'PENDING';

-- Packaged products (ADR 0002): one shared Open Food Facts row per barcode.
-- @@unique([ownerId, barcode]) covers private rows only (NULLs are distinct).
CREATE UNIQUE INDEX IF NOT EXISTS "packaged_products_public_barcode"
  ON "packaged_products" ("barcode")
  WHERE "ownerId" IS NULL;
