-- CreateEnum
CREATE TYPE "IngredientNoticeKind" AS ENUM ('VERIFIED_DATA', 'CHECK_DATA');

-- CreateTable
CREATE TABLE "ingredient_notices" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "IngredientNoticeKind" NOT NULL,
    "review" TEXT NOT NULL,
    "ingredientNames" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "ingredient_notices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ingredient_notices_userId_readAt_idx" ON "ingredient_notices"("userId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "ingredient_notices_userId_kind_review_key" ON "ingredient_notices"("userId", "kind", "review");

-- AddForeignKey
ALTER TABLE "ingredient_notices" ADD CONSTRAINT "ingredient_notices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

