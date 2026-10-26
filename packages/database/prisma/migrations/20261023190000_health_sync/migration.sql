-- C2 health sync (Apple Health / Health Connect), additive.

-- AlterEnum
ALTER TYPE "ConsentKind" ADD VALUE 'HEALTH_SYNC';

-- CreateEnum
CREATE TYPE "WeightSource" AS ENUM ('MANUAL', 'APPLE_HEALTH', 'HEALTH_CONNECT');

-- AlterTable
ALTER TABLE "weight_entries" ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "source" "WeightSource" NOT NULL DEFAULT 'MANUAL';

-- CreateIndex
CREATE UNIQUE INDEX "weight_entries_userId_externalId_key" ON "weight_entries"("userId", "externalId");
