-- Lane K4 (market review 2026-10): "client went quiet" alert. The trainer
-- picks after how many days (default 3), an optional daily digest email, and
-- the badge counts clients who went quiet since the trainer last looked.

-- AlterTable
ALTER TABLE "trainer_profiles" ADD COLUMN     "quietAfterDays" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "quietDigestEmail" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "quietSeenAt" TIMESTAMP(3);
