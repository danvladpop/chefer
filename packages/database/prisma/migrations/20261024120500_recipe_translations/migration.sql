-- CreateEnum
CREATE TYPE "TranslationStatus" AS ENUM ('MACHINE_DRAFT', 'REVIEWED');

-- CreateTable
CREATE TABLE "recipe_translations" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "instructions" TEXT[],
    "ingredientNames" TEXT[],
    "status" "TranslationStatus" NOT NULL DEFAULT 'MACHINE_DRAFT',
    "source" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recipe_translations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recipe_translations_locale_status_idx" ON "recipe_translations"("locale", "status");

-- CreateIndex
CREATE UNIQUE INDEX "recipe_translations_recipeId_locale_key" ON "recipe_translations"("recipeId", "locale");

-- AddForeignKey
ALTER TABLE "recipe_translations" ADD CONSTRAINT "recipe_translations_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

