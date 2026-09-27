-- CreateEnum
CREATE TYPE "OnboardingJob" AS ENUM ('TRAIN', 'PLAN_MEALS', 'HOUSEHOLD', 'USE_WHAT_I_HAVE', 'SAVED_RECIPES', 'TRACK');

-- CreateEnum
CREATE TYPE "TargetMode" AS ENUM ('SUGGESTED', 'OWN');

-- CreateEnum
CREATE TYPE "TargetChangeKind" AS ENUM ('CHANGED', 'SUGGESTED');

-- CreateEnum
CREATE TYPE "ConsentKind" AS ENUM ('TERMS', 'PRIVACY', 'AGE', 'AI', 'ANALYTICS_ANON', 'ANALYTICS_LINKED', 'EMAIL_WEEK_READY', 'EMAIL_RECAP', 'AUTO_PLAN', 'HEALTH');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Goal" ADD VALUE 'RECOMP';
ALTER TYPE "Goal" ADD VALUE 'PERFORMANCE';

-- AlterEnum
ALTER TYPE "AiCallType" ADD VALUE 'CURATED_PLAN';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "emailDefaultsNoticeAt" TIMESTAMP(3),
ADD COLUMN     "healthDataConsentAt" TIMESTAMP(3),
ADD COLUMN     "healthDataConsentVersion" TEXT,
ADD COLUMN     "termsAcceptedVersion" TEXT,
ALTER COLUMN "weeklyEmailReady" SET DEFAULT false,
ALTER COLUMN "weeklyEmailRecap" SET DEFAULT false;

-- AlterTable
ALTER TABLE "chef_profiles" ADD COLUMN     "addTrainingBonus" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "customCarbsG" INTEGER,
ADD COLUMN     "customFatG" INTEGER,
ADD COLUMN     "customKcal" INTEGER,
ADD COLUMN     "customProteinG" INTEGER,
ADD COLUMN     "customTrainingKcal" INTEGER,
ADD COLUMN     "customTrainingProteinG" INTEGER,
ADD COLUMN     "onboardingJobs" "OnboardingJob"[] DEFAULT ARRAY[]::"OnboardingJob"[],
ADD COLUMN     "showNutritionOnToday" BOOLEAN,
ADD COLUMN     "targetMode" "TargetMode" NOT NULL DEFAULT 'SUGGESTED',
ADD COLUMN     "targetSnapshot" JSONB,
ADD COLUMN     "timeZone" TEXT,
ADD COLUMN     "trainingDayKinds" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "trainingWeekdays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ALTER COLUMN "autoPlanWeekly" SET DEFAULT false;

-- AlterTable
ALTER TABLE "dietary_preferences" ADD COLUMN     "cookingFor" INTEGER,
ADD COLUMN     "excludeLabelDependent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "leftovers" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "planDays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "planSlots" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "safetyReviewedAt" TIMESTAMP(3),
ADD COLUMN     "timeCapMins" INTEGER,
ADD COLUMN     "weekendNoLimit" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "chef_reviews" ADD COLUMN     "proposalResolvedAt" TIMESTAMP(3),
ADD COLUMN     "proposedAdjustmentKcal" INTEGER;

-- AlterTable
ALTER TABLE "ai_call_logs" ADD COLUMN     "provider" TEXT,
ADD COLUMN     "saved" BOOLEAN;

-- AlterTable
ALTER TABLE "gym_profiles" ADD COLUMN     "carryOver" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "hasWeightedVest" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "quietNudgeDays" INTEGER,
ADD COLUMN     "reminderTimes" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "sessionLengthMins" INTEGER;

-- CreateTable
CREATE TABLE "safety_reports" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "surface" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "rulesSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "safety_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "target_changes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "TargetChangeKind" NOT NULL,
    "reason" TEXT NOT NULL,
    "fields" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolution" TEXT,

    CONSTRAINT "target_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "ConsentKind" NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "providers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "documentVersion" TEXT,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consent_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "safety_reports_userId_idx" ON "safety_reports"("userId");

-- CreateIndex
CREATE INDEX "safety_reports_recipeId_idx" ON "safety_reports"("recipeId");

-- CreateIndex
CREATE INDEX "target_changes_userId_resolvedAt_idx" ON "target_changes"("userId", "resolvedAt");

-- CreateIndex
CREATE INDEX "consent_events_userId_createdAt_idx" ON "consent_events"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "safety_reports" ADD CONSTRAINT "safety_reports_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "target_changes" ADD CONSTRAINT "target_changes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_events" ADD CONSTRAINT "consent_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

