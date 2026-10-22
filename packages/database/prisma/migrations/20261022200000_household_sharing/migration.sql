-- CreateEnum
CREATE TYPE "HouseholdLinkStatus" AS ENUM ('ACTIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "HouseholdEndedBy" AS ENUM ('OWNER', 'PARTNER', 'SYSTEM');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationKind" ADD VALUE 'HOUSEHOLD_PARTNER_JOINED';
ALTER TYPE "NotificationKind" ADD VALUE 'HOUSEHOLD_PARTNER_LEFT';
ALTER TYPE "NotificationKind" ADD VALUE 'HOUSEHOLD_REMOVED';
ALTER TYPE "NotificationKind" ADD VALUE 'HOUSEHOLD_ENDED';

-- AlterTable
ALTER TABLE "shopping_lists" ADD COLUMN     "checkedMeta" JSONB NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "household_invites" (
    "code" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "usedById" TEXT,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "household_invites_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "household_links" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "memberId" TEXT,
    "status" "HouseholdLinkStatus" NOT NULL DEFAULT 'ACTIVE',
    "inviteCode" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "endedBy" "HouseholdEndedBy",

    CONSTRAINT "household_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "household_invites_ownerId_createdAt_idx" ON "household_invites"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "household_invites_memberId_idx" ON "household_invites"("memberId");

-- CreateIndex
CREATE INDEX "household_links_ownerId_status_idx" ON "household_links"("ownerId", "status");

-- CreateIndex
CREATE INDEX "household_links_partnerId_status_idx" ON "household_links"("partnerId", "status");

-- AddForeignKey
ALTER TABLE "household_invites" ADD CONSTRAINT "household_invites_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household_invites" ADD CONSTRAINT "household_invites_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "household_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household_invites" ADD CONSTRAINT "household_invites_usedById_fkey" FOREIGN KEY ("usedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household_links" ADD CONSTRAINT "household_links_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household_links" ADD CONSTRAINT "household_links_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household_links" ADD CONSTRAINT "household_links_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "household_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ADR 0002: one active household per partner, one active partner per member profile
-- (also in prisma/ensure-indexes.sql, which deploys apply after `db push`).
CREATE UNIQUE INDEX "household_links_one_active_partner" ON "household_links"("partnerId") WHERE "status" = 'ACTIVE';
CREATE UNIQUE INDEX "household_links_one_active_member" ON "household_links"("memberId") WHERE "status" = 'ACTIVE';
