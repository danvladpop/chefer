-- Simple training mode phase 1 (docs/prd-2026-10/casual-training-mode.md): additive.
CREATE TYPE "TrainingStyle" AS ENUM ('SIMPLE', 'PROGRESSIVE');

CREATE TYPE "WorkoutType" AS ENUM ('UPPER_BODY', 'LOWER_BODY', 'FULL_BODY', 'STRENGTH_OTHER', 'CARDIO_MACHINES', 'RUNNING', 'WALKING', 'SWIMMING', 'CYCLING', 'YOGA', 'PILATES', 'SPIN', 'HIIT', 'DANCE', 'OTHER_CLASS', 'OTHER');

-- Every existing profile keeps today's experience.
ALTER TABLE "gym_profiles" ADD COLUMN "trainingStyle" "TrainingStyle" NOT NULL DEFAULT 'PROGRESSIVE';

-- My week: a routine day's workout type ("Tue · Yoga").
ALTER TABLE "routine_days" ADD COLUMN "workoutType" "WorkoutType";

-- The workout's type (live or logged).
ALTER TABLE "workout_sessions" ADD COLUMN "workoutType" "WorkoutType";
