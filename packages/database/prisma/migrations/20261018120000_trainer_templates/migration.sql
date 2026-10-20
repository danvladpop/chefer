-- AlterTable
ALTER TABLE "routine_days" ADD COLUMN     "editedSinceTemplate" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "templateAssignedAt" TIMESTAMP(3),
ADD COLUMN     "templateId" TEXT,
ADD COLUMN     "templateName" TEXT,
ADD COLUMN     "templateVersion" INTEGER;

-- CreateTable
CREATE TABLE "workout_templates" (
    "id" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "workoutType" "WorkoutType",
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "workout_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workout_template_exercises" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "sets" INTEGER NOT NULL,
    "repMin" INTEGER NOT NULL,
    "repMax" INTEGER NOT NULL,
    "targetRir" INTEGER NOT NULL DEFAULT 2,
    "restSec" INTEGER NOT NULL,
    "supersetGroup" TEXT,
    "defaultLoadKg" DOUBLE PRECISION,
    "trainerNote" TEXT,

    CONSTRAINT "workout_template_exercises_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workout_templates_trainerId_deletedAt_idx" ON "workout_templates"("trainerId", "deletedAt");

-- CreateIndex
CREATE INDEX "workout_template_exercises_templateId_idx" ON "workout_template_exercises"("templateId");

-- CreateIndex
CREATE INDEX "routine_days_templateId_idx" ON "routine_days"("templateId");

-- AddForeignKey
ALTER TABLE "workout_templates" ADD CONSTRAINT "workout_templates_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_template_exercises" ADD CONSTRAINT "workout_template_exercises_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "workout_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_template_exercises" ADD CONSTRAINT "workout_template_exercises_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "exercises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

