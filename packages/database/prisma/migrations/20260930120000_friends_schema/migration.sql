-- CreateEnum
CREATE TYPE "ProfileVisibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "FollowStatus" AS ENUM ('PENDING', 'ACCEPTED');

-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('FOLLOW_REQUEST', 'NEW_FOLLOWER', 'REQUEST_ACCEPTED');

-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('INAPPROPRIATE', 'SPAM', 'HARASSMENT', 'UNSAFE', 'OTHER');

-- CreateEnum
CREATE TYPE "RecipeHiddenReason" AS ENUM ('REPORTS', 'FILTER');

-- CreateEnum
CREATE TYPE "ModerationAction" AS ENUM ('RECIPE_AUTO_HIDDEN', 'ACCOUNT_FORCED_PRIVATE', 'RECIPE_FILTER_HIDDEN', 'NAME_REJECTED', 'RECIPE_TEXT_REJECTED', 'UNDO');

-- AlterEnum
ALTER TYPE "ConsentKind" ADD VALUE 'SOCIAL_SHARING';

-- AlterTable
ALTER TABLE "recipes" ADD COLUMN     "hiddenAt" TIMESTAMP(3),
ADD COLUMN     "hiddenReason" "RecipeHiddenReason",
ADD COLUMN     "originCreatorId" TEXT,
ADD COLUMN     "originRecipeId" TEXT;

-- CreateTable
CREATE TABLE "social_profiles" (
    "userId" TEXT NOT NULL,
    "visibility" "ProfileVisibility" NOT NULL DEFAULT 'PRIVATE',
    "searchName" TEXT NOT NULL,
    "sharePlan" BOOLEAN NOT NULL DEFAULT true,
    "shareRecipes" BOOLEAN NOT NULL DEFAULT true,
    "shareWorkouts" BOOLEAN NOT NULL DEFAULT true,
    "shareTargets" BOOLEAN NOT NULL DEFAULT false,
    "forcedPrivateAt" TIMESTAMP(3),
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "social_profiles_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "follows" (
    "id" TEXT NOT NULL,
    "followerId" TEXT NOT NULL,
    "followeeId" TEXT NOT NULL,
    "status" "FollowStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),

    CONSTRAINT "follows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blocks" (
    "blockerId" TEXT NOT NULL,
    "blockedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blocks_pkey" PRIMARY KEY ("blockerId","blockedId")
);

-- CreateTable
CREATE TABLE "suggestion_dismissals" (
    "userId" TEXT NOT NULL,
    "dismissedUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suggestion_dismissals_pkey" PRIMARY KEY ("userId","dismissedUserId")
);

-- CreateTable
CREATE TABLE "user_reports" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "recipeId" TEXT,
    "reason" "ReportReason" NOT NULL,
    "eligible" BOOLEAN NOT NULL,
    "discountedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moderation_log" (
    "id" TEXT NOT NULL,
    "action" "ModerationAction" NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "recipeId" TEXT,
    "reason" TEXT NOT NULL,
    "distinctReporters" INTEGER,
    "actor" TEXT NOT NULL,
    "undoOfId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moderation_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "social_profiles_visibility_forcedPrivateAt_idx" ON "social_profiles"("visibility", "forcedPrivateAt");

-- CreateIndex
CREATE INDEX "social_profiles_searchName_idx" ON "social_profiles"("searchName");

-- CreateIndex
CREATE INDEX "follows_followeeId_status_createdAt_idx" ON "follows"("followeeId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "follows_followerId_status_createdAt_idx" ON "follows"("followerId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "follows_followerId_followeeId_key" ON "follows"("followerId", "followeeId");

-- CreateIndex
CREATE INDEX "blocks_blockedId_idx" ON "blocks"("blockedId");

-- CreateIndex
CREATE INDEX "user_reports_targetUserId_eligible_idx" ON "user_reports"("targetUserId", "eligible");

-- CreateIndex
CREATE INDEX "user_reports_recipeId_eligible_idx" ON "user_reports"("recipeId", "eligible");

-- CreateIndex
CREATE INDEX "user_reports_createdAt_idx" ON "user_reports"("createdAt");

-- CreateIndex
CREATE INDEX "moderation_log_createdAt_idx" ON "moderation_log"("createdAt");

-- CreateIndex
CREATE INDEX "moderation_log_targetUserId_idx" ON "moderation_log"("targetUserId");

-- CreateIndex
CREATE INDEX "notifications_userId_createdAt_idx" ON "notifications"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_userId_readAt_idx" ON "notifications"("userId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_userId_kind_actorId_key" ON "notifications"("userId", "kind", "actorId");

-- CreateIndex
CREATE INDEX "recipes_creatorId_originRecipeId_idx" ON "recipes"("creatorId", "originRecipeId");

-- CreateIndex
CREATE INDEX "recipes_creatorId_source_createdAt_idx" ON "recipes"("creatorId", "source", "createdAt");

-- AddForeignKey
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_originRecipeId_fkey" FOREIGN KEY ("originRecipeId") REFERENCES "recipes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_originCreatorId_fkey" FOREIGN KEY ("originCreatorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_profiles" ADD CONSTRAINT "social_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follows" ADD CONSTRAINT "follows_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follows" ADD CONSTRAINT "follows_followeeId_fkey" FOREIGN KEY ("followeeId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suggestion_dismissals" ADD CONSTRAINT "suggestion_dismissals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suggestion_dismissals" ADD CONSTRAINT "suggestion_dismissals_dismissedUserId_fkey" FOREIGN KEY ("dismissedUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_reports" ADD CONSTRAINT "user_reports_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_reports" ADD CONSTRAINT "user_reports_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_log" ADD CONSTRAINT "moderation_log_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

