// ─── Workout types (simple training mode §6.3, GLOSSARY "Workout type") ───────
// One shared list for live workouts, logged workouts ("Log a workout") and My
// week. It extends the WP-20 activity catalogue with strength focuses. Every
// type counts toward the weekly goal and streak AND as a nutrition training
// day (F-1, both training styles).
//
// A logged workout is stored the WP-20 way — a finished WorkoutSession with ONE
// DURATION entry — so every shipped client renders it. `exerciseId` is that
// entry's catalogue row: the WP-20 activity row where one exists, otherwise
// the generic `other-activity` (already in every binary's activity set). The
// session also carries `workoutType`, which is what new clients read.
//
// MET ranges feed the calorie estimate (burn.ts). Cardio and class types reuse
// the cardio catalogue's values; strength is 3.5–6 (Compendium 02054 → 02050).

export const WorkoutType = {
  UPPER_BODY: 'UPPER_BODY',
  LOWER_BODY: 'LOWER_BODY',
  FULL_BODY: 'FULL_BODY',
  STRENGTH_OTHER: 'STRENGTH_OTHER',
  CARDIO_MACHINES: 'CARDIO_MACHINES',
  RUNNING: 'RUNNING',
  WALKING: 'WALKING',
  SWIMMING: 'SWIMMING',
  CYCLING: 'CYCLING',
  YOGA: 'YOGA',
  PILATES: 'PILATES',
  SPIN: 'SPIN',
  HIIT: 'HIIT',
  DANCE: 'DANCE',
  OTHER_CLASS: 'OTHER_CLASS',
  OTHER: 'OTHER',
} as const;
export type WorkoutType = (typeof WorkoutType)[keyof typeof WorkoutType];

export type WorkoutTypeGroup = 'strength' | 'cardio' | 'classes' | 'other';

export interface WorkoutTypeEntry {
  type: WorkoutType;
  group: WorkoutTypeGroup;
  /** Chip and session-name label ("Upper body", "Yoga"). */
  label: string;
  /** Catalogue exercise a LOGGED workout's one DURATION entry uses. */
  exerciseId: string;
  metLow: number;
  metHigh: number;
}

export const WORKOUT_TYPE_GROUPS: readonly { group: WorkoutTypeGroup; label: string }[] = [
  { group: 'strength', label: 'Strength' },
  { group: 'cardio', label: 'Cardio' },
  { group: 'classes', label: 'Classes' },
  { group: 'other', label: 'Other' },
];

const GENERIC = 'other-activity';

/** Display order: grouped as in WORKOUT_TYPE_GROUPS. */
export const WORKOUT_TYPES: readonly WorkoutTypeEntry[] = [
  {
    type: 'UPPER_BODY',
    group: 'strength',
    label: 'Upper body',
    exerciseId: GENERIC,
    metLow: 3.5,
    metHigh: 6,
  },
  {
    type: 'LOWER_BODY',
    group: 'strength',
    label: 'Lower body',
    exerciseId: GENERIC,
    metLow: 3.5,
    metHigh: 6,
  },
  {
    type: 'FULL_BODY',
    group: 'strength',
    label: 'Full body',
    exerciseId: GENERIC,
    metLow: 3.5,
    metHigh: 6,
  },
  {
    type: 'STRENGTH_OTHER',
    group: 'strength',
    label: 'Strength (other)',
    exerciseId: GENERIC,
    metLow: 3.5,
    metHigh: 6,
  },
  {
    type: 'CARDIO_MACHINES',
    group: 'cardio',
    label: 'Cardio machines',
    exerciseId: GENERIC,
    metLow: 5,
    metHigh: 9,
  },
  {
    type: 'RUNNING',
    group: 'cardio',
    label: 'Running',
    exerciseId: 'running',
    metLow: 8,
    metHigh: 12,
  },
  {
    type: 'WALKING',
    group: 'cardio',
    label: 'Walking',
    exerciseId: 'walking',
    metLow: 2.8,
    metHigh: 4.3,
  },
  {
    type: 'SWIMMING',
    group: 'cardio',
    label: 'Swimming',
    exerciseId: 'swimming',
    metLow: 5.8,
    metHigh: 9.8,
  },
  {
    type: 'CYCLING',
    group: 'cardio',
    label: 'Cycling',
    exerciseId: GENERIC,
    metLow: 4,
    metHigh: 10,
  },
  {
    type: 'YOGA',
    group: 'classes',
    label: 'Yoga',
    exerciseId: 'yoga-class',
    metLow: 2.5,
    metHigh: 4,
  },
  {
    type: 'PILATES',
    group: 'classes',
    label: 'Pilates',
    exerciseId: 'pilates-class',
    metLow: 3,
    metHigh: 4,
  },
  {
    type: 'SPIN',
    group: 'classes',
    label: 'Spin',
    exerciseId: 'spin-class',
    metLow: 6,
    metHigh: 10,
  },
  {
    type: 'HIIT',
    group: 'classes',
    label: 'HIIT',
    exerciseId: 'hiit-class',
    metLow: 6,
    metHigh: 10,
  },
  {
    type: 'DANCE',
    group: 'classes',
    label: 'Dance',
    exerciseId: 'dance-class',
    metLow: 4.5,
    metHigh: 7.5,
  },
  {
    type: 'OTHER_CLASS',
    group: 'classes',
    label: 'Other class',
    exerciseId: GENERIC,
    metLow: 3,
    metHigh: 8,
  },
  { type: 'OTHER', group: 'other', label: 'Other', exerciseId: GENERIC, metLow: 3, metHigh: 8 },
];

export const WORKOUT_TYPE_BY_KEY: ReadonlyMap<WorkoutType, WorkoutTypeEntry> = new Map(
  WORKOUT_TYPES.map((t) => [t.type, t]),
);

/** Exercise ids a logged workout's one entry can carry (WP-20 rows + the generic one). */
export const LOGGED_WORKOUT_EXERCISE_IDS: ReadonlySet<string> = new Set(
  WORKOUT_TYPES.map((t) => t.exerciseId),
);

/** Longest logged workout the sheet accepts (the set's `durationSec` caps at 3 h). */
export const LOGGED_WORKOUT_MAX_DURATION_MIN = 180;
/** Largest kcal the sheet accepts (the wire schema allows 10 000). */
export const LOGGED_WORKOUT_MAX_KCAL = 5000;
/** The free-text name of an "Other" workout. */
export const WORKOUT_NAME_MAX_LENGTH = 40;

/**
 * Training style (GLOSSARY): how someone wants the gym side to work —
 * "Keep it simple" or "Track my progress". A preference, not a skill level
 * (TrainingExperience stays separate).
 */
export const TrainingStyle = { SIMPLE: 'SIMPLE', PROGRESSIVE: 'PROGRESSIVE' } as const;
export type TrainingStyle = (typeof TrainingStyle)[keyof typeof TrainingStyle];

export const TRAINING_STYLE_LABEL: Record<TrainingStyle, string> = {
  SIMPLE: 'Keep it simple',
  PROGRESSIVE: 'Track my progress',
};

/**
 * "How do you like to train?" — the one question onboarding V4 and gym setup
 * ask (§6.1). Two answers map to SIMPLE on purpose.
 */
export const TRAINING_STYLE_ANSWERS: readonly {
  key: 'program' | 'workout' | 'classes';
  label: string;
  style: TrainingStyle;
}[] = [
  { key: 'program', label: 'I follow a program and track my lifts', style: 'PROGRESSIVE' },
  { key: 'workout', label: 'I just want a good workout', style: 'SIMPLE' },
  { key: 'classes', label: 'Mostly classes, or with a trainer', style: 'SIMPLE' },
];
