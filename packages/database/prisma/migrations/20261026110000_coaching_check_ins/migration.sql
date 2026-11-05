-- Lane K3 (market review 2026-10): automated weekly check-ins from a trainer
-- to their clients, answered in the app (and prompted by email).

-- AlterTable
ALTER TABLE "trainer_profiles" ADD COLUMN     "checkInDay" INTEGER NOT NULL DEFAULT 6,
ADD COLUMN     "checkInEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "checkInQuestions" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "coachingCheckInEmail" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "coaching_check_ins" (
    "id" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "periodStart" TEXT NOT NULL,
    "questions" TEXT[],
    "answers" JSONB NOT NULL,
    "note" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coaching_check_ins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "coaching_check_ins_trainerId_clientId_periodStart_idx" ON "coaching_check_ins"("trainerId", "clientId", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "coaching_check_ins_trainerId_clientId_periodStart_key" ON "coaching_check_ins"("trainerId", "clientId", "periodStart");

-- AddForeignKey
ALTER TABLE "coaching_check_ins" ADD CONSTRAINT "coaching_check_ins_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coaching_check_ins" ADD CONSTRAINT "coaching_check_ins_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
