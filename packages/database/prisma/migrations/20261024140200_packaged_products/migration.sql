-- CreateEnum
CREATE TYPE "PackagedProductSource" AS ENUM ('OFF', 'LABEL', 'USER');

-- CreateTable
CREATE TABLE "packaged_products" (
    "id" TEXT NOT NULL,
    "barcode" TEXT,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "kcalPer100g" DOUBLE PRECISION,
    "proteinPer100g" DOUBLE PRECISION,
    "carbsPer100g" DOUBLE PRECISION,
    "fatPer100g" DOUBLE PRECISION,
    "fiberPer100g" DOUBLE PRECISION,
    "sugarPer100g" DOUBLE PRECISION,
    "saturatedFatPer100g" DOUBLE PRECISION,
    "saltPer100g" DOUBLE PRECISION,
    "servingSizeG" DOUBLE PRECISION,
    "allergenTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "traceTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "allergensKnown" BOOLEAN NOT NULL DEFAULT false,
    "imageUrl" TEXT,
    "source" "PackagedProductSource" NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ownerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "packaged_products_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "packaged_products_barcode_idx" ON "packaged_products"("barcode");

-- CreateIndex
CREATE INDEX "packaged_products_ownerId_idx" ON "packaged_products"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "packaged_products_ownerId_barcode_key" ON "packaged_products"("ownerId", "barcode");

-- AddForeignKey
ALTER TABLE "packaged_products" ADD CONSTRAINT "packaged_products_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- One shared Open Food Facts row per barcode (also in ensure-indexes.sql,
-- which deploys run after `prisma db push`).
CREATE UNIQUE INDEX "packaged_products_public_barcode" ON "packaged_products"("barcode") WHERE "ownerId" IS NULL;
