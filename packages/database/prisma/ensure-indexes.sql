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

-- ADR 0002 household sharing: a person is a partner in at most one household,
-- and a member profile is claimed by at most one partner. The join transaction
-- checks both first; these indexes are the database-level backstop.
CREATE UNIQUE INDEX IF NOT EXISTS "household_links_one_active_partner"
  ON "household_links" ("partnerId")
  WHERE "status" = 'ACTIVE';
CREATE UNIQUE INDEX IF NOT EXISTS "household_links_one_active_member"
  ON "household_links" ("memberId")
  WHERE "status" = 'ACTIVE';
