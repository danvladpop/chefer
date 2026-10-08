-- AlterTable
ALTER TABLE "daily_logs" ADD COLUMN     "skippedSlots" JSONB NOT NULL DEFAULT '[]';
