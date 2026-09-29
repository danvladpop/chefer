// ─── Gym vocabulary ───────────────────────────────────────────────────────────
// String unions mirror the Prisma enums (gym_plan.md §2.2) as const objects so
// Prisma's generated string enums assign cleanly (same trick as UserRole).

export const MUSCLES = [
  'chest',
  'front-delts',
  'side-delts',
  'rear-delts',
  'lats',
  'upper-back',
  'traps',
  'biceps',
  'triceps',
  'forearms',
  'quads',
  'hamstrings',
  'glutes',
  'adductors',
  'abductors',
  'calves',
  'abs',
  'obliques',
  'lower-back',
] as const;
export type Muscle = (typeof MUSCLES)[number];

export const MUSCLE_LABELS: Record<Muscle, string> = {
  chest: 'Chest',
  'front-delts': 'Front delts',
  'side-delts': 'Side delts',
  'rear-delts': 'Rear delts',
  lats: 'Lats',
  'upper-back': 'Upper back',
  traps: 'Traps',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Forearms',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  glutes: 'Glutes',
  adductors: 'Adductors',
  abductors: 'Abductors',
  calves: 'Calves',
  abs: 'Abs',
  obliques: 'Obliques',
  'lower-back': 'Lower back',
};

/**
 * Muscle groups used for weekly-volume guidance (research §2.2). "back" is
 * lats + upper-back; muscles not listed here are shown but never warned about.
 */
export const VOLUME_GROUPS = {
  chest: ['chest'],
  back: ['lats', 'upper-back'],
  quads: ['quads'],
  hamstrings: ['hamstrings'],
  glutes: ['glutes'],
  'side-delts': ['side-delts'],
  'rear-delts': ['rear-delts'],
  'front-delts': ['front-delts'],
  biceps: ['biceps'],
  triceps: ['triceps'],
  calves: ['calves'],
  abs: ['abs', 'obliques'],
} as const satisfies Record<string, readonly Muscle[]>;
export type VolumeGroup = keyof typeof VOLUME_GROUPS;

export const ExerciseEquipment = {
  BARBELL: 'BARBELL',
  DUMBBELL: 'DUMBBELL',
  CABLE: 'CABLE',
  MACHINE: 'MACHINE',
  BODYWEIGHT: 'BODYWEIGHT',
  SMITH: 'SMITH',
  EZ_BAR: 'EZ_BAR',
  KETTLEBELL: 'KETTLEBELL',
  BAND: 'BAND',
  ASSISTED: 'ASSISTED',
  // S19 (T-42.0, 06 §5.3) — cardio equipment. Never sent to a level < 2
  // client (Δ2.1).
  TREADMILL: 'TREADMILL',
  BIKE: 'BIKE',
  ROWER: 'ROWER',
  ELLIPTICAL: 'ELLIPTICAL',
  STAIR_CLIMBER: 'STAIR_CLIMBER',
  SKI_ERG: 'SKI_ERG',
  ASSAULT_BIKE: 'ASSAULT_BIKE',
  JUMP_ROPE: 'JUMP_ROPE',
  POOL: 'POOL',
  OUTDOOR: 'OUTDOOR',
} as const;
export type ExerciseEquipment = (typeof ExerciseEquipment)[keyof typeof ExerciseEquipment];

/**
 * S18 (T-42.0, 06 §5.1) — how an exercise is logged. All six land at once;
 * `INTERVALS` is unused until W5. Additive: `renderableTrackingTypes()`
 * (`apps/api/src/application/gym/client-level.ts`) gates which types an old
 * client is ever sent (Δ2.1).
 */
export const ExerciseTrackingType = {
  WEIGHT_REPS: 'WEIGHT_REPS',
  BODYWEIGHT_REPS: 'BODYWEIGHT_REPS',
  DURATION: 'DURATION',
  DURATION_DISTANCE: 'DURATION_DISTANCE',
  DISTANCE: 'DISTANCE',
  INTERVALS: 'INTERVALS',
} as const;
export type ExerciseTrackingType = (typeof ExerciseTrackingType)[keyof typeof ExerciseTrackingType];

/** S21 (T-42.0) — `GymProfile.distanceUnit`; null ⇒ derived from `unit` (Δ2.2). */
export const DistanceUnit = { KM: 'KM', MI: 'MI' } as const;
export type DistanceUnit = (typeof DistanceUnit)[keyof typeof DistanceUnit];

export const ExerciseLoadType = {
  WEIGHTED: 'WEIGHTED',
  BODYWEIGHT: 'BODYWEIGHT',
  BODYWEIGHT_PLUS: 'BODYWEIGHT_PLUS',
  ASSISTED: 'ASSISTED',
} as const;
export type ExerciseLoadType = (typeof ExerciseLoadType)[keyof typeof ExerciseLoadType];

export const ExerciseCategory = { COMPOUND: 'COMPOUND', ISOLATION: 'ISOLATION' } as const;
export type ExerciseCategory = (typeof ExerciseCategory)[keyof typeof ExerciseCategory];

export const TrainingExperience = { BEGINNER: 'BEGINNER', INTERMEDIATE: 'INTERMEDIATE' } as const;
export type TrainingExperience = (typeof TrainingExperience)[keyof typeof TrainingExperience];

export const GymEquipmentAccess = {
  FULL_GYM: 'FULL_GYM',
  DUMBBELLS: 'DUMBBELLS',
  BODYWEIGHT: 'BODYWEIGHT',
} as const;
export type GymEquipmentAccess = (typeof GymEquipmentAccess)[keyof typeof GymEquipmentAccess];

export const WeightUnit = { KG: 'KG', LB: 'LB' } as const;
export type WeightUnit = (typeof WeightUnit)[keyof typeof WeightUnit];

export const WorkoutStatus = {
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  DISCARDED: 'DISCARDED',
} as const;
export type WorkoutStatus = (typeof WorkoutStatus)[keyof typeof WorkoutStatus];

/** Reps-in-reserve chip values; 3 means "3+". */
export const RIR_VALUES = [0, 1, 2, 3] as const;
export type Rir = (typeof RIR_VALUES)[number];

/** Default kg plate pairs / dumbbells (research §1.2). LB users get native lb lists. */
export const DEFAULT_PLATE_PAIRS_KG = [25, 20, 15, 10, 5, 2.5, 1.25] as const;
export const DEFAULT_PLATE_PAIRS_LB = [45, 35, 25, 10, 5, 2.5] as const;
export const DEFAULT_DUMBBELLS_KG = [
  2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22.5, 25, 27.5, 30, 32.5, 35, 37.5, 40, 42.5, 45, 47.5, 50,
] as const;
export const DEFAULT_DUMBBELLS_LB = [
  5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100,
] as const;

export const LB_PER_KG = 2.2046226218;
