-- CreateEnum
CREATE TYPE "IngredientStatus" AS ENUM ('ACTIVE', 'MERGED', 'DEPRECATED');

-- CreateEnum
CREATE TYPE "NutritionSource" AS ENUM ('USDA_FDC', 'CIQUAL', 'LABEL', 'USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "NutritionStatus" AS ENUM ('COMPUTED', 'PARTIAL', 'USER_ENTERED');

-- CreateEnum
CREATE TYPE "IngredientCategory" AS ENUM ('VEGETABLE', 'FRUIT', 'HERB_FRESH', 'SPICE_DRIED', 'LEGUME', 'GRAIN_CEREAL', 'FLOUR_BAKING', 'PASTA_NOODLE', 'BREAD_BAKERY', 'NUT_SEED', 'BEEF', 'PORK', 'LAMB_GOAT', 'POULTRY', 'GAME', 'PROCESSED_MEAT', 'FISH', 'SEAFOOD', 'EGG', 'DAIRY_MILK', 'DAIRY_CHEESE', 'DAIRY_YOGURT_CREAM', 'PLANT_PROTEIN', 'PLANT_MILK', 'OIL_FAT', 'CONDIMENT_SAUCE', 'VINEGAR', 'SWEETENER', 'CANNED_JARRED', 'PICKLED_FERMENTED', 'STOCK_BROTH', 'BEVERAGE', 'ALCOHOL_COOKING', 'SUPPLEMENT', 'SNACK_PREPARED', 'OTHER');

-- AlterTable
ALTER TABLE "recipes" ADD COLUMN     "nutritionComputedAt" TIMESTAMP(3),
ADD COLUMN     "nutritionStatus" "NutritionStatus" NOT NULL DEFAULT 'PARTIAL',
ADD COLUMN     "nutritionTotal" JSONB;

-- AlterTable
ALTER TABLE "ingredient_prices" ADD COLUMN     "ingredientId" TEXT;

-- CreateTable
CREATE TABLE "ingredients" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "IngredientCategory" NOT NULL,
    "status" "IngredientStatus" NOT NULL DEFAULT 'ACTIVE',
    "mergedIntoId" TEXT,
    "ownerId" TEXT,
    "kcalPer100g" DOUBLE PRECISION NOT NULL,
    "proteinPer100g" DOUBLE PRECISION NOT NULL,
    "carbsPer100g" DOUBLE PRECISION NOT NULL,
    "fatPer100g" DOUBLE PRECISION NOT NULL,
    "fiberPer100g" DOUBLE PRECISION NOT NULL,
    "sugarPer100g" DOUBLE PRECISION,
    "satFatPer100g" DOUBLE PRECISION,
    "sodiumMgPer100g" DOUBLE PRECISION,
    "densityGPerMl" DOUBLE PRECISION,
    "edibleFraction" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "nutritionSource" "NutritionSource" NOT NULL,
    "sourceRef" TEXT,
    "sourceNote" TEXT,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingredient_aliases" (
    "id" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "ownerId" TEXT,

    CONSTRAINT "ingredient_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingredient_portions" (
    "id" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "grams" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL,

    CONSTRAINT "ingredient_portions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_ingredients" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "ingredientId" TEXT,
    "rawName" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "grams" DOUBLE PRECISION,
    "note" TEXT,
    "optional" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "recipe_ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ingredients_ownerId_idx" ON "ingredients"("ownerId");

-- CreateIndex
CREATE INDEX "ingredients_status_idx" ON "ingredients"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ingredients_ownerId_slug_key" ON "ingredients"("ownerId", "slug");

-- CreateIndex
CREATE INDEX "ingredient_aliases_alias_idx" ON "ingredient_aliases"("alias");

-- CreateIndex
CREATE INDEX "ingredient_aliases_ingredientId_idx" ON "ingredient_aliases"("ingredientId");

-- CreateIndex
CREATE UNIQUE INDEX "ingredient_aliases_ownerId_alias_key" ON "ingredient_aliases"("ownerId", "alias");

-- CreateIndex
CREATE UNIQUE INDEX "ingredient_portions_ingredientId_unit_key" ON "ingredient_portions"("ingredientId", "unit");

-- CreateIndex
CREATE INDEX "recipe_ingredients_recipeId_idx" ON "recipe_ingredients"("recipeId");

-- CreateIndex
CREATE INDEX "recipe_ingredients_ingredientId_idx" ON "recipe_ingredients"("ingredientId");

-- CreateIndex
CREATE INDEX "ingredient_prices_ingredientId_idx" ON "ingredient_prices"("ingredientId");

-- AddForeignKey
ALTER TABLE "ingredient_prices" ADD CONSTRAINT "ingredient_prices_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "ingredients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "ingredients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingredient_aliases" ADD CONSTRAINT "ingredient_aliases_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "ingredients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingredient_portions" ADD CONSTRAINT "ingredient_portions_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "ingredients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "ingredients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

