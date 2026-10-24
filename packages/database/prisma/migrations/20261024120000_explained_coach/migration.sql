-- Lane D2 (market review 2026-10): partly logged days and the coach's "why".
-- AlterTable
ALTER TABLE "daily_logs" ADD COLUMN "incomplete" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "chef_reviews" ADD COLUMN "explanation" JSONB;
