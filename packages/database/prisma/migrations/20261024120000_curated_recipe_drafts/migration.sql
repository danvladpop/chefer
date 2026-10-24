-- CreateEnum
CREATE TYPE "CuratedDraftStatus" AS ENUM ('EXTRACTING', 'FAILED', 'DRAFT', 'APPROVED', 'REJECTED', 'UNPUBLISHED');

-- CreateEnum
CREATE TYPE "CuratedProseStatus" AS ENUM ('ORIGINAL', 'REWRITTEN', 'EDITED');

-- CreateTable
CREATE TABLE "curated_recipe_drafts" (
    "id" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "submittedUrl" TEXT NOT NULL,
    "via" TEXT NOT NULL,
    "status" "CuratedDraftStatus" NOT NULL DEFAULT 'EXTRACTING',
    "draft" JSONB,
    "mealTypes" TEXT[],
    "proseStatus" "CuratedProseStatus" NOT NULL DEFAULT 'ORIGINAL',
    "assumptions" TEXT[],
    "notFound" TEXT[],
    "platform" TEXT,
    "creator" TEXT,
    "sourceTitle" TEXT,
    "transcriptSource" TEXT,
    "error" TEXT,
    "rejectReason" TEXT,
    "recipeId" TEXT,
    "createdById" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "curated_recipe_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "curated_recipe_drafts_sourceUrl_key" ON "curated_recipe_drafts"("sourceUrl");

-- CreateIndex
CREATE UNIQUE INDEX "curated_recipe_drafts_recipeId_key" ON "curated_recipe_drafts"("recipeId");

-- CreateIndex
CREATE INDEX "curated_recipe_drafts_status_submittedAt_idx" ON "curated_recipe_drafts"("status", "submittedAt");

-- CreateIndex
CREATE INDEX "curated_recipe_drafts_submittedAt_idx" ON "curated_recipe_drafts"("submittedAt");

