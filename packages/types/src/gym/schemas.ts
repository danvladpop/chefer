// ─── Gym Zod schemas — the wire + offline-storage contract ───────────────────
// Shared by the API (tRPC inputs), mobile (offline docs, forms) and web.
// Additive changes only once mobile binaries ship (CLAUDE.md platform parity):
// new optional fields, never renames. WorkoutSessionDoc carries schemaVersion.

import { z } from 'zod';
import { REASON_CODES } from './engine';
import {
  ExerciseCategory,
  ExerciseEquipment,
  ExerciseLoadType,
  GymEquipmentAccess,
  MUSCLES,
  TrainingExperience,
  WeightUnit,
  WorkoutStatus,
} from './vocab';

const values = <T extends Record<string, string>>(o: T) =>
  Object.values(o) as [T[keyof T], ...T[keyof T][]];

export const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
export const isoDateTimeSchema = z.string().datetime({ offset: true });
export const clientIdSchema = z.string().uuid();
export const weightKgSchema = z.number().min(0).max(1000);
export const rirSchema = z.number().int().min(0).max(3);
export const muscleSchema = z.enum(MUSCLES);

export const exerciseEquipmentSchema = z.enum(values(ExerciseEquipment));
export const exerciseLoadTypeSchema = z.enum(values(ExerciseLoadType));
export const exerciseCategorySchema = z.enum(values(ExerciseCategory));
export const trainingExperienceSchema = z.enum(values(TrainingExperience));
export const gymEquipmentAccessSchema = z.enum(values(GymEquipmentAccess));
export const weightUnitSchema = z.enum(values(WeightUnit));
export const workoutStatusSchema = z.enum(values(WorkoutStatus));

// ─── Suggestion (stored on every session exercise) ────────────────────────────

export const suggestionSchema = z.object({
  kind: z.enum(['start', 'increase', 'hold', 'decrease', 'deload']),
  weightKg: weightKgSchema,
  reps: z.array(z.number().int().min(0).max(3600)).max(10),
  sets: z.number().int().min(0).max(10),
  reasonCode: z.enum(REASON_CODES),
  inputs: z.record(z.union([z.number(), z.string(), z.boolean(), z.null(), z.array(z.number())])),
  deltaKg: z.number(),
  engineVersion: z.number().int().min(1),
});

// ─── Workout session document (offline-first sync unit) ──────────────────────

export const sessionSetDocSchema = z.object({
  id: clientIdSchema,
  position: z.number().int().min(0).max(50),
  weightKg: weightKgSchema,
  /** Reps, or seconds for timed exercises. */
  reps: z.number().int().min(0).max(3600),
  isWarmup: z.boolean(),
  completedAt: isoDateTimeSchema.nullable(),
});
export type SessionSetDoc = z.infer<typeof sessionSetDocSchema>;

export const sessionExerciseDocSchema = z.object({
  id: clientIdSchema,
  exerciseId: z.string().min(1).max(100),
  routineExerciseId: z.string().max(100).nullable(),
  position: z.number().int().min(0).max(50),
  repMin: z.number().int().min(1).max(3600),
  repMax: z.number().int().min(1).max(3600),
  targetRir: z.number().int().min(0).max(4),
  restSec: z.number().int().min(0).max(900),
  skipped: z.boolean(),
  swappedFromId: z.string().max(100).nullable(),
  lastSetRir: rirSchema.nullable(),
  prescription: suggestionSchema,
  notes: z.string().max(500).nullable(),
  sets: z.array(sessionSetDocSchema).max(20),
});
export type SessionExerciseDoc = z.infer<typeof sessionExerciseDocSchema>;

export const workoutSessionDocSchema = z.object({
  schemaVersion: z.literal(1),
  id: clientIdSchema,
  routineId: z.string().max(100).nullable(),
  routineDayId: z.string().max(100).nullable(),
  name: z.string().min(1).max(80),
  status: workoutStatusSchema,
  startedAt: isoDateTimeSchema,
  finishedAt: isoDateTimeSchema.nullable(),
  localDate: localDateSchema,
  isDeload: z.boolean(),
  notes: z.string().max(1000).nullable(),
  clientUpdatedAt: isoDateTimeSchema,
  engineVersion: z.number().int().min(1),
  exercises: z.array(sessionExerciseDocSchema).max(30),
});
export type WorkoutSessionDoc = z.infer<typeof workoutSessionDocSchema>;

export const upsertSessionsInputSchema = z.object({
  docs: z.array(workoutSessionDocSchema).min(1).max(20),
});

// ─── Routine document (full-replace saves with optimistic concurrency) ───────

export const routineExerciseDocSchema = z
  .object({
    /** Existing id to keep (so session links survive); omit for new rows. */
    id: z.string().max(100).optional(),
    exerciseId: z.string().min(1).max(100),
    sets: z.number().int().min(1).max(10),
    repMin: z.number().int().min(1).max(3600),
    repMax: z.number().int().min(1).max(3600),
    targetRir: z.number().int().min(0).max(4),
    restSec: z.number().int().min(15).max(900),
    supersetGroup: z.string().max(20).nullable(),
    notes: z.string().max(500).nullable(),
  })
  .refine((e) => e.repMin <= e.repMax, { message: 'repMin must be ≤ repMax' });
export type RoutineExerciseDoc = z.infer<typeof routineExerciseDocSchema>;

export const routineDayDocSchema = z.object({
  id: z.string().max(100).optional(),
  name: z.string().min(1).max(40),
  plannedWeekday: z.number().int().min(0).max(6).nullable(),
  exercises: z.array(routineExerciseDocSchema).max(20),
});
export type RoutineDayDoc = z.infer<typeof routineDayDocSchema>;

export const routineDocSchema = z.object({
  id: z.string().max(100),
  name: z.string().min(1).max(60),
  days: z.array(routineDayDocSchema).min(1).max(7),
});
export type RoutineDoc = z.infer<typeof routineDocSchema>;

export const saveRoutineInputSchema = z.object({
  routine: routineDocSchema,
  expectedVersion: z.number().int().min(1),
});

// ─── Setup, profile, library, progression ────────────────────────────────────

export const recommendInputSchema = z.object({
  days: z.number().int().min(2).max(6),
  experience: trainingExperienceSchema,
  equipmentAccess: gymEquipmentAccessSchema,
});
export type RecommendInput = z.infer<typeof recommendInputSchema>;

export const completeSetupInputSchema = recommendInputSchema.extend({
  unit: weightUnitSchema,
  templateKey: z.string().min(1).max(40),
  plannedWeekdays: z.array(z.number().int().min(0).max(6)).max(7),
  reminderTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable(),
  /** "I know my weights": exerciseId → working weight (kg). Omit to calibrate. */
  knownWeightsKg: z.record(weightKgSchema).optional(),
});
export type CompleteSetupInput = z.infer<typeof completeSetupInputSchema>;

export const saveGymProfileInputSchema = z.object({
  unit: weightUnitSchema.optional(),
  experience: trainingExperienceSchema.optional(),
  equipmentAccess: gymEquipmentAccessSchema.optional(),
  weeklyGoal: z.number().int().min(1).max(7).optional(),
  barWeightKg: weightKgSchema.optional(),
  platePairsKg: z.array(weightKgSchema).max(20).optional(),
  dumbbellsKg: z.array(weightKgSchema).max(80).optional(),
  machineStepKg: z.number().min(0.5).max(50).optional(),
  cableStepKg: z.number().min(0.5).max(50).optional(),
  hasDipBelt: z.boolean().optional(),
  microPlates: z.boolean().optional(),
  reminderEnabled: z.boolean().optional(),
  reminderTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable()
    .optional(),
});
export type SaveGymProfileInput = z.infer<typeof saveGymProfileInputSchema>;

export const customExerciseInputSchema = z
  .object({
    name: z.string().min(2).max(60),
    category: exerciseCategorySchema,
    equipment: exerciseEquipmentSchema,
    loadType: exerciseLoadTypeSchema,
    primaryMuscles: z.array(muscleSchema).min(1).max(4),
    secondaryMuscles: z.array(muscleSchema).max(6),
    repMin: z.number().int().min(1).max(3600),
    repMax: z.number().int().min(1).max(3600),
    restSec: z.number().int().min(15).max(900),
    isTimed: z.boolean(),
    cues: z.array(z.string().min(1).max(120)).max(6),
  })
  .refine((e) => e.repMin <= e.repMax, { message: 'repMin must be ≤ repMax' });
export type CustomExerciseInput = z.infer<typeof customExerciseInputSchema>;

export const setOverrideInputSchema = z.object({
  exerciseId: z.string().min(1).max(100),
  repBucket: z.string().min(1).max(20),
  weightKg: weightKgSchema,
  reps: z.array(z.number().int().min(0).max(3600)).min(1).max(10),
});

export const pauseInputSchema = z.object({
  startDate: localDateSchema,
  endDate: localDateSchema,
  reason: z.enum(['vacation', 'illness', 'injury', 'other']).nullable(),
});

export const offerKindSchema = z.enum(['deload', 'stall', 'comeback', 'recap']);
export type GymOfferKind = z.infer<typeof offerKindSchema>;

export const statsRangeSchema = z.enum(['3m', '1y', 'all']);
export type StatsRange = z.infer<typeof statsRangeSchema>;
