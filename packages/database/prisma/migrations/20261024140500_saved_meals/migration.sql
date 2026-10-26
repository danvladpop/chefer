-- CreateTable
CREATE TABLE "saved_meals" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "lastLoggedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_meals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "saved_meals_userId_idx" ON "saved_meals"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "saved_meals_userId_name_key" ON "saved_meals"("userId", "name");

-- AddForeignKey
ALTER TABLE "saved_meals" ADD CONSTRAINT "saved_meals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

