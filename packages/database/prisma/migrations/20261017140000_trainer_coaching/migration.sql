-- CreateEnum
CREATE TYPE "CoachingLinkStatus" AS ENUM ('ACTIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "CoachingEndedBy" AS ENUM ('CLIENT', 'TRAINER', 'SYSTEM');

-- AlterEnum
ALTER TYPE "ConsentKind" ADD VALUE 'COACHING_SHARING';

-- AlterTable
ALTER TABLE "consent_events" ADD COLUMN     "contextId" TEXT;

-- AlterTable
ALTER TABLE "routine_exercises" ADD COLUMN     "lastEditedAt" TIMESTAMP(3),
ADD COLUMN     "lastEditedById" TEXT,
ADD COLUMN     "trainerNote" TEXT;

-- AlterTable
ALTER TABLE "routines" ADD COLUMN     "lastEditedAt" TIMESTAMP(3),
ADD COLUMN     "lastEditedById" TEXT;

-- CreateTable
CREATE TABLE "trainer_profiles" (
    "userId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disabledAt" TIMESTAMP(3),

    CONSTRAINT "trainer_profiles_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "coaching_invites" (
    "code" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "usedById" TEXT,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "coaching_invites_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "coaching_links" (
    "id" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "status" "CoachingLinkStatus" NOT NULL DEFAULT 'ACTIVE',
    "inviteCode" TEXT,
    "trainerLabel" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedOn" TEXT,
    "endedAt" TIMESTAMP(3),
    "endedBy" "CoachingEndedBy",

    CONSTRAINT "coaching_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coaching_notes" (
    "trainerId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "hiddenAt" TIMESTAMP(3),

    CONSTRAINT "coaching_notes_pkey" PRIMARY KEY ("trainerId","clientId")
);

-- CreateIndex
CREATE INDEX "coaching_invites_trainerId_createdAt_idx" ON "coaching_invites"("trainerId", "createdAt");

-- CreateIndex
CREATE INDEX "coaching_links_trainerId_status_idx" ON "coaching_links"("trainerId", "status");

-- CreateIndex
CREATE INDEX "coaching_links_clientId_status_idx" ON "coaching_links"("clientId", "status");

-- AddForeignKey
ALTER TABLE "routines" ADD CONSTRAINT "routines_lastEditedById_fkey" FOREIGN KEY ("lastEditedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routine_exercises" ADD CONSTRAINT "routine_exercises_lastEditedById_fkey" FOREIGN KEY ("lastEditedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainer_profiles" ADD CONSTRAINT "trainer_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coaching_invites" ADD CONSTRAINT "coaching_invites_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coaching_invites" ADD CONSTRAINT "coaching_invites_usedById_fkey" FOREIGN KEY ("usedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coaching_links" ADD CONSTRAINT "coaching_links_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coaching_links" ADD CONSTRAINT "coaching_links_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coaching_notes" ADD CONSTRAINT "coaching_notes_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coaching_notes" ADD CONSTRAINT "coaching_notes_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- One ACTIVE trainer per client (spec §5.1). Raw SQL: Prisma cannot express a
-- partial unique index. The join transaction ends the old link first, so a
-- switch never trips it; a race between two joins does, and one of them loses.
CREATE UNIQUE INDEX "coaching_links_one_active_trainer" ON "coaching_links"("clientId") WHERE "status" = 'ACTIVE';
