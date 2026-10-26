import { z } from 'zod';
import { muscleSchema, weightUnitSchema } from './schemas';
import type { Muscle, WeightUnit } from './vocab';

// ─── Workout import from Strong / Hevy CSV (G2, market review 2026-10) ────────
// Importing a Strong export is how lifters switch apps. The CSV is parsed on
// the server (`@chefer/utils` parseWorkoutCsv), the user reviews how each
// exercise name maps onto Chefer's library, then the workouts are written as
// ordinary COMPLETED sessions — so PRs, e1RM charts and progression see them.

export const WORKOUT_IMPORT_SOURCES = ['STRONG', 'HEVY'] as const;
export type WorkoutImportSource = (typeof WORKOUT_IMPORT_SOURCES)[number];

/** The CSV text is sent inline; years of Strong history are well under 1 MB. */
export const WORKOUT_IMPORT_MAX_CHARS = 5_000_000;

// ─── The parsed file (pure, `@chefer/utils` gym/workout-import.ts) ────────────

/** Strong: W / D / F in "Set Order"; Hevy: `set_type`. Only warm-ups are stored differently. */
export type ImportedSetKind = 'normal' | 'warmup' | 'drop' | 'failure';

export interface ImportedSet {
  kind: ImportedSetKind;
  /** Kilograms; 0 for bodyweight or an empty cell. Assisted exercises carry the assistance. */
  weightKg: number;
  reps: number | null;
  distanceM: number | null;
  durationSec: number | null;
  /** 1–10 as the source app logged it (may be fractional, e.g. 8.5). */
  rpe: number | null;
}

export interface ImportedExercise {
  /** As written in the file, trimmed ("Bench Press (Barbell)"). */
  name: string;
  notes: string | null;
  sets: ImportedSet[];
}

export interface ImportedWorkout {
  /** Stable per workout within its source app — drives re-import idempotency. */
  key: string;
  title: string;
  /** Wall-clock start as the source app recorded it (no time zone in either export). */
  localDate: string;
  localTime: string;
  durationSec: number | null;
  notes: string | null;
  exercises: ImportedExercise[];
}

export interface ParsedWorkoutImport {
  source: WorkoutImportSource;
  /** The unit the file's weights were in (they are converted to kg already). */
  weightUnit: WeightUnit;
  workouts: ImportedWorkout[];
  /** Rows that could not be read (bad date, no exercise name…). */
  skippedRows: number;
}

export type WorkoutCsvParseResult =
  | { ok: true; import: ParsedWorkoutImport }
  | {
      ok: false;
      /**
       * `needs_unit`: an older Strong export (comma layout) writes weights in
       * the app's unit without saying which — the user has to tell us.
       */
      reason: 'empty' | 'unknown_format' | 'needs_unit' | 'no_workouts';
      source: WorkoutImportSource | null;
    };

// ─── API: gym.import.preview / gym.import.commit ─────────────────────────────

export const workoutImportPreviewInputSchema = z.object({
  csv: z.string().min(1).max(WORKOUT_IMPORT_MAX_CHARS),
  /** Only needed when the preview answered `needs_unit`. */
  weightUnit: weightUnitSchema.optional(),
});
export type WorkoutImportPreviewInput = z.infer<typeof workoutImportPreviewInputSchema>;

export const workoutImportActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('existing'), exerciseId: z.string().min(1).max(100) }),
  /** A new custom exercise named as in the file; equipment and tracking are inferred. */
  z.object({ type: z.literal('create'), primaryMuscle: muscleSchema }),
  z.object({ type: z.literal('skip') }),
]);
export type WorkoutImportAction = z.infer<typeof workoutImportActionSchema>;

export const workoutImportCommitInputSchema = workoutImportPreviewInputSchema.extend({
  /** IANA zone of the device, to place the file's wall-clock times. */
  timeZone: z.string().min(1).max(64),
  /** One per exercise name in the preview; a name without a mapping is skipped. */
  mappings: z
    .array(z.object({ name: z.string().min(1).max(200), action: workoutImportActionSchema }))
    .max(1000),
});
export type WorkoutImportCommitInput = z.infer<typeof workoutImportCommitInputSchema>;

export type WorkoutImportMatchStatus = 'matched' | 'suggested' | 'unmatched';

export interface WorkoutImportExerciseRowDto {
  name: string;
  sets: number;
  workouts: number;
  /** What the file's sets look like — decides the tracking of a created exercise. */
  kind: 'strength' | 'bodyweight' | 'timed' | 'cardio';
  status: WorkoutImportMatchStatus;
  /** The exercise it maps to: certain when `matched`, a best guess when `suggested`. */
  exerciseId: string | null;
  exerciseName: string | null;
  /** Up to 3 alternatives to offer in the review. */
  alternatives: { id: string; name: string }[];
  /** Default for "Create as my own exercise". */
  suggestedMuscle: Muscle;
}

export type WorkoutImportPreviewDto =
  | { status: 'invalid'; reason: 'empty' | 'unknown_format' | 'no_workouts' }
  | { status: 'needs_unit'; source: WorkoutImportSource }
  | {
      status: 'ready';
      source: WorkoutImportSource;
      weightUnit: WeightUnit;
      workouts: number;
      sets: number;
      firstDate: string;
      lastDate: string;
      /** Workouts from this file already in Chefer (a re-import skips them). */
      alreadyImported: number;
      exercises: WorkoutImportExerciseRowDto[];
    };

export interface WorkoutImportResultDto {
  source: WorkoutImportSource;
  /** Workouts written now. */
  imported: number;
  /** Workouts that were already there (same file imported before) — untouched. */
  alreadyImported: number;
  /** Workouts left with no exercises after "skip" choices. */
  skippedWorkouts: number;
  createdExercises: number;
  /** Sets beyond Chefer's per-exercise limit, left out. */
  trimmedSets: number;
  firstDate: string | null;
  lastDate: string | null;
}
