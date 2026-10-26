-- CreateEnum
CREATE TYPE "WorkoutImportSource" AS ENUM ('STRONG', 'HEVY');

-- AlterTable
ALTER TABLE "workout_sessions" ADD COLUMN     "importSource" "WorkoutImportSource";

