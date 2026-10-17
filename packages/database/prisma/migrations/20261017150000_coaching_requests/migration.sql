-- CreateEnum
CREATE TYPE "CoachingRequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationKind" ADD VALUE 'COACHING_REQUEST';
ALTER TYPE "NotificationKind" ADD VALUE 'COACHING_REQUEST_ACCEPTED';
ALTER TYPE "NotificationKind" ADD VALUE 'COACHING_REQUEST_DECLINED';
ALTER TYPE "NotificationKind" ADD VALUE 'COACHING_ROUTINE_UPDATED';
ALTER TYPE "NotificationKind" ADD VALUE 'COACHING_ENDED';

-- AlterTable
ALTER TABLE "coaching_links" ADD COLUMN     "requestId" TEXT;

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "payload" JSONB;

-- AlterTable
ALTER TABLE "trainer_profiles" ADD COLUMN     "gymLine" TEXT;

-- CreateTable
CREATE TABLE "coaching_requests" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "status" "CoachingRequestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "startedOn" TEXT,

    CONSTRAINT "coaching_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "coaching_requests_trainerId_status_createdAt_idx" ON "coaching_requests"("trainerId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "coaching_requests_clientId_status_idx" ON "coaching_requests"("clientId", "status");

-- AddForeignKey
ALTER TABLE "coaching_requests" ADD CONSTRAINT "coaching_requests_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coaching_requests" ADD CONSTRAINT "coaching_requests_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- One PENDING coaching request per client (PRD §4.1). Raw SQL: Prisma cannot
-- express a partial unique index. The request transaction flips an expired
-- PENDING row to EXPIRED first, so only a race between two requests trips it.
CREATE UNIQUE INDEX "coaching_requests_one_pending" ON "coaching_requests"("clientId") WHERE "status" = 'PENDING';
