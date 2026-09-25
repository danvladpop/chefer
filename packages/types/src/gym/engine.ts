// ─── Progression-engine data shapes ──────────────────────────────────────────
// Contract between the pure engine (@chefer/utils gym/*) and its callers (API,
// mobile, web). Spec: docs/gym/programming-research.md §1. JSON-safe on purpose
// (ISO strings, no Date) — these are persisted in Postgres Json columns and in
// the phone's offline cache.

import type {
  ExerciseCategory,
  ExerciseEquipment,
  ExerciseLoadType,
  Muscle,
  Rir,
  TrainingExperience,
  WeightUnit,
} from './vocab';

/** Static facts about an exercise the engine needs (subset of the Exercise row). */
export interface ExerciseMeta {
  id: string;
  name: string;
  category: ExerciseCategory;
  movementPattern: string;
  equipment: ExerciseEquipment;
  loadType: ExerciseLoadType;
  primaryMuscles: Muscle[];
  secondaryMuscles: Muscle[];
  repMin: number;
  repMax: number;
  restSec: number;
  incrementKg: number;
  perHand: boolean;
  isLowerBody: boolean;
  isTimed: boolean;
  swapGroup: string | null;
}

/** One exercise slot as prescribed (routine exercise or its session snapshot). */
export interface ExerciseSlot {
  exercise: ExerciseMeta;
  sets: number;
  repMin: number;
  repMax: number;
  targetRir: number;
  restSec: number;
  /** Per-slot load step override ("this machine goes up in 7 kg"). */
  stepOverrideKg?: number | null;
}

/** The user's equipment inventory (GymProfile subset). All values kg. */
export interface EquipmentProfile {
  unit: WeightUnit;
  barWeightKg: number;
  platePairsKg: number[];
  dumbbellsKg: number[];
  machineStepKg: number;
  cableStepKg: number;
  hasDipBelt: boolean;
  microPlates: boolean;
}

export interface ExposureSet {
  weightKg: number;
  reps: number;
  isWarmup: boolean;
  /** false = planned but never ticked. */
  completed: boolean;
}

/** One exercise inside one finished session — the engine's input unit. */
export interface Exposure {
  sessionId: string;
  localDate: string;
  /** ISO timestamp the session started (sort key). */
  performedAt: string;
  /** Slot parameters as they were for this session (snapshot). */
  sets: number;
  repMin: number;
  repMax: number;
  targetRir: number;
  loggedSets: ExposureSet[];
  lastSetRir: Rir | null;
  wasDeload: boolean;
  skipped: boolean;
}

export const REASON_CODES = [
  'START',
  'START_CALIBRATING',
  'TOP_OF_RANGE',
  'TOP_EASY_DOUBLE_JUMP',
  'EASY_ADD_LOAD',
  'ADD_REPS',
  'CONSOLIDATE',
  'NEW_WEIGHT_SETTLING',
  'MISSED_ONCE',
  'MISSED_TWICE',
  'STALL_RESET',
  'STALL_SUGGEST_SWAP',
  'INCOMPLETE',
  'DELOAD',
  'DELOAD_DONE',
  'BREAK_HOLD',
  'BREAK_REENTRY',
  'BREAK_FAST_TRACK',
  'CALIBRATING_UP',
  'CALIBRATING_DOWN',
  'BW_ADD_SET',
  'BW_ADD_LOAD',
  'ASSIST_DOWN',
  'USER_OVERRIDE',
] as const;
export type ReasonCode = (typeof REASON_CODES)[number];

export type SuggestionKind = 'start' | 'increase' | 'hold' | 'decrease' | 'deload';

/** What the engine prescribes for the next exposure of one exercise. */
export interface Suggestion {
  kind: SuggestionKind;
  /** Working weight (kg). For ASSISTED exercises: the assistance. For bodyweight: added load. */
  weightKg: number;
  /** One rep (or seconds, for timed exercises) target per working set. */
  reps: number[];
  /** Working sets to do (usually slot.sets; BW_ADD_SET and deloads change it). */
  sets: number;
  reasonCode: ReasonCode;
  /** Numbers behind the decision, for the "Why?" sheet (research §1.12). */
  inputs: Record<string, number | string | boolean | null | number[]>;
  deltaKg: number;
  engineVersion: number;
}

/** Engine memory per (user, exercise, rep bucket). Research §1.2. */
export interface ProgressionState {
  workingWeightKg: number;
  repTargets: number[];
  sets: number;
  missStreak: number;
  stallCount: number;
  /** ISO dates of STALL_RESET events (for the "2 resets in 10 weeks" rule). */
  resetDates: string[];
  calibrating: boolean;
  calibrationExposures: number;
  justIncreased: boolean;
  preBreakWeightKg: number | null;
  lastExposureDate: string | null;
  /** Best totalReps at workingWeightKg (progress detection). */
  lastTotalReps: number | null;
  /** The suggestion computed after the last exposure (before break/override/deload adjustments). */
  next: Suggestion;
}

/** User-edited next targets (D5c). Applies once, to the next exposure after `at`. */
export interface ProgressionOverride {
  weightKg: number;
  reps: number[];
  at: string;
}

export interface WarmupSet {
  weightKg: number;
  reps: number;
}

// ─── Weeks, streaks, habit ────────────────────────────────────────────────────

export interface GoalHistoryEntry {
  /** Monday "YYYY-MM-DD" from which this goal applies. */
  fromWeek: string;
  goal: number;
}

export interface PauseRange {
  startDate: string;
  endDate: string;
}

export type WeekStatus = 'met' | 'flex' | 'paused' | 'under' | 'empty' | 'current';

export interface WeekSummary {
  /** Monday "YYYY-MM-DD". */
  weekStart: string;
  goal: number;
  sessions: number;
  status: WeekStatus;
  /** Flex tokens held after this week was settled. */
  flexTokens: number;
}

export interface StreakInfo {
  /** Consecutive met/flex/paused weeks ending at the last settled week (current week counts if already met). */
  current: number;
  best: number;
  flexTokens: number;
  /** Sessions logged in the current week and its goal (the week ring). */
  thisWeekSessions: number;
  thisWeekGoal: number;
}

// ─── Routine analysis ─────────────────────────────────────────────────────────

export type RoutineHintRule =
  | 'V1'
  | 'V2'
  | 'V3'
  | 'V4'
  | 'V5'
  | 'V6'
  | 'V7'
  | 'V8'
  | 'V9'
  | 'V10'
  | 'V11';

export interface RoutineHint {
  rule: RoutineHintRule;
  level: 'info' | 'warning';
  message: string;
  group?: string;
  dayIndex?: number;
  exerciseId?: string;
}

/** Minimal routine shape the analysis functions accept (DTO or draft). */
export interface RoutineLike {
  days: {
    name: string;
    exercises: {
      exerciseId: string;
      sets: number;
      repMin: number;
      repMax: number;
      restSec: number;
    }[];
  }[];
}

export interface MuscleVolume {
  group: string;
  direct: number;
  fractional: number;
  /** Number of days with direct work. */
  days: number;
  /** Productive band for the user's experience level. */
  floor: number;
  productiveMax: number;
  warnAbove: number;
}

// ─── PRs & stats ──────────────────────────────────────────────────────────────

export type PrKind = 'weight' | 'reps' | 'e1rm';

export interface PersonalRecord {
  exerciseId: string;
  kind: PrKind;
  weightKg: number;
  reps: number;
  e1rmKg: number | null;
  localDate: string;
  sessionId: string;
}

export interface TrainingProfileFacts {
  experience: TrainingExperience;
  /** From the nutrition profile if known; drives the ≥65 re-entry column. */
  ageYears: number | null;
}
