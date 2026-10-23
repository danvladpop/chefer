-- CreateTable
CREATE TABLE "progress_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "localDate" TEXT NOT NULL,
    "xp" INTEGER NOT NULL,
    "lines" JSONB NOT NULL,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "origin" TEXT NOT NULL,
    "rulesVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "progress_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cook_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "recipeId" TEXT,
    "localDate" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cook_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "progress_states" (
    "userId" TEXT NOT NULL,
    "totalXp" INTEGER NOT NULL DEFAULT 0,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "goalHistory" JSONB NOT NULL DEFAULT '[]',
    "pauses" JSONB NOT NULL DEFAULT '[]',
    "backfillVersion" INTEGER,
    "introducedAt" TIMESTAMP(3),
    "seenCursor" TIMESTAMP(3),
    "lastSeenLevel" INTEGER NOT NULL DEFAULT 1,
    "recapSeenWeek" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "progress_states_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "progress_unlocks" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "achievementId" TEXT NOT NULL,
    "tier" INTEGER NOT NULL,
    "unlockedAt" TIMESTAMP(3) NOT NULL,
    "seenAt" TIMESTAMP(3),

    CONSTRAINT "progress_unlocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "progress_quest_days" (
    "userId" TEXT NOT NULL,
    "localDate" TEXT NOT NULL,
    "quests" JSONB NOT NULL,

    CONSTRAINT "progress_quest_days_pkey" PRIMARY KEY ("userId","localDate")
);

-- CreateIndex
CREATE INDEX "progress_events_userId_localDate_idx" ON "progress_events"("userId", "localDate");

-- CreateIndex
CREATE INDEX "progress_events_userId_createdAt_idx" ON "progress_events"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "progress_events_userId_key_key" ON "progress_events"("userId", "key");

-- CreateIndex
CREATE INDEX "cook_logs_userId_localDate_idx" ON "cook_logs"("userId", "localDate");

-- CreateIndex
CREATE INDEX "cook_logs_userId_recipeId_idx" ON "cook_logs"("userId", "recipeId");

-- CreateIndex
CREATE UNIQUE INDEX "progress_unlocks_userId_achievementId_tier_key" ON "progress_unlocks"("userId", "achievementId", "tier");

-- AddForeignKey
ALTER TABLE "progress_events" ADD CONSTRAINT "progress_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cook_logs" ADD CONSTRAINT "cook_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cook_logs" ADD CONSTRAINT "cook_logs_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "recipes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progress_states" ADD CONSTRAINT "progress_states_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progress_unlocks" ADD CONSTRAINT "progress_unlocks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progress_quest_days" ADD CONSTRAINT "progress_quest_days_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

