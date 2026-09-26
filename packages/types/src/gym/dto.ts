// ─── Gym API outputs ──────────────────────────────────────────────────────────
// All dates are ISO strings (not Date) so gym query results survive the mobile
// offline cache's JSON persistence unchanged.

import type {
  ExerciseMeta,
  MuscleVolume,
  PersonalRecord,
  ProgressionOverride,
  ProgressionState,
  RoutineHint,
  StreakInfo,
  Suggestion,
  WarmupSet,
  WeekSummary,
} from './engine';
import type { GymOfferKind, WorkoutSessionDoc } from './schemas';
import type { GymEquipmentAccess, Rir, TrainingExperience, WeightUnit } from './vocab';

export interface ExerciseDto extends ExerciseMeta {
  ownerId: string | null;
  aliases: string[];
  cues: string[];
  mistakes: string[];
  blurb: string | null;
  /** Absolute or API-relative image URLs (start, end). */
  images: string[];
  videoId: string | null;
  videoStartSec: number | null;
  videoChannel: string | null;
  archived: boolean;
  updatedAt: string;
}

export interface GymProfileDto {
  experience: TrainingExperience;
  equipmentAccess: GymEquipmentAccess;
  unit: WeightUnit;
  weeklyGoal: number;
  barWeightKg: number;
  platePairsKg: number[];
  dumbbellsKg: number[];
  machineStepKg: number;
  cableStepKg: number;
  hasDipBelt: boolean;
  microPlates: boolean;
  reminderEnabled: boolean;
  reminderTime: string | null;
  setupCompletedAt: string | null;
}

export interface RoutineExerciseDto {
  id: string;
  exerciseId: string;
  position: number;
  sets: number;
  repMin: number;
  repMax: number;
  targetRir: number;
  restSec: number;
  supersetGroup: string | null;
  notes: string | null;
}

export interface RoutineDayDto {
  id: string;
  position: number;
  name: string;
  plannedWeekday: number | null;
  exercises: RoutineExerciseDto[];
}

export interface RoutineDto {
  id: string;
  name: string;
  templateKey: string | null;
  isActive: boolean;
  nextDayId: string | null;
  version: number;
  archived: boolean;
  days: RoutineDayDto[];
  updatedAt: string;
}

export interface RoutineListItemDto {
  id: string;
  name: string;
  templateKey: string | null;
  isActive: boolean;
  dayCount: number;
  archived: boolean;
  updatedAt: string;
}

export interface ProgressionDto {
  exerciseId: string;
  repBucket: string;
  state: ProgressionState;
  override: ProgressionOverride | null;
  /** Prescription for the next exposure as of `serverTime` (break/override/deload applied). */
  suggestion: Suggestion;
}

export interface LastTimeSet {
  weightKg: number;
  reps: number;
}

export interface NextWorkoutExerciseDto {
  routineExerciseId: string;
  exerciseId: string;
  position: number;
  sets: number;
  repMin: number;
  repMax: number;
  targetRir: number;
  restSec: number;
  supersetGroup: string | null;
  notes: string | null;
  repBucket: string;
  suggestion: Suggestion;
  warmups: WarmupSet[];
  lastTime: { localDate: string; sets: LastTimeSet[]; lastSetRir: Rir | null } | null;
}

export interface NextWorkoutDto {
  routineId: string;
  dayId: string;
  dayName: string;
  isDeload: boolean;
  estimatedMin: number;
  exercises: NextWorkoutExerciseDto[];
}

/** Compact past session for offline history, last-time columns and PR detection. */
export interface SessionSummaryDto {
  id: string;
  name: string;
  routineDayId: string | null;
  status: WorkoutSessionDoc['status'];
  localDate: string;
  startedAt: string;
  finishedAt: string | null;
  isDeload: boolean;
  exercises: {
    exerciseId: string;
    skipped: boolean;
    lastSetRir: Rir | null;
    /** Additive (mobile in stores may not send it): the note typed for this exercise that session. */
    notes?: string | null;
    sets: { weightKg: number; reps: number; isWarmup: boolean; completed: boolean }[];
  }[];
}

export interface GymOffer {
  kind: GymOfferKind;
  /** Stable id so a dismissal can be remembered. */
  key: string;
  title: string;
  body: string;
  exerciseId?: string;
  data?: Record<string, number | string | null>;
}

/** The pause covering `today` (device-local), if any — lets a client end it directly. */
export interface ActivePauseDto {
  id: string;
  startDate: string;
  endDate: string;
  reason: string | null;
}

export interface GymBootstrap {
  profile: GymProfileDto | null;
  activeRoutine: RoutineDto | null;
  nextWorkout: NextWorkoutDto | null;
  /** Curated + own custom exercises (delta when `librarySince` was passed). */
  library: ExerciseDto[];
  /** Pass back as `librarySince` next time. */
  libraryCursor: string;
  progressions: ProgressionDto[];
  /** Completed sessions of the last ~12 weeks, newest first. */
  recentSessions: SessionSummaryDto[];
  weeks: WeekSummary[];
  streak: StreakInfo;
  offers: GymOffer[];
  /** The pause covering `today`, or null — additive field, see gym_plan.md §1.4 / §9.2. */
  activePause: ActivePauseDto | null;
  /** Latest known bodyweight (kg) from the nutrition weight log. */
  bodyweightKg: number | null;
  /**
   * Per-exercise bests from completed sessions OLDER than `recentSessions`
   * (audit F-GYM-6-1: live PR badges compared against 12 weeks only and
   * celebrated false PRs). Optional/additive — older clients ignore it.
   */
  olderBests?: Record<string, ExerciseBest>;
  serverTime: string;
  engineVersion: number;
}

/** Compact all-time record for one exercise — what a new set must beat. */
export interface ExerciseBest {
  maxWeightKg: number;
  maxE1rmKg: number | null;
  /** Pareto frontier of [weightKg, reps] working sets (no set both heavier and longer). */
  frontier: [number, number][];
}

export type SyncStatus = 'applied' | 'stale' | 'rejected';

export interface SyncResultDto {
  id: string;
  status: SyncStatus;
  reason?: string;
}

export interface UpsertSessionsResultDto {
  results: SyncResultDto[];
}

export interface TemplateSummaryDto {
  key: string;
  name: string;
  daysPerWeek: number;
  experience: TrainingExperience;
  description: string;
}

export interface RecommendResultDto {
  recommendedKey: string;
  /** Short "why this program" line. */
  reason: string;
  alternatives: TemplateSummaryDto[];
  preview: {
    key: string;
    name: string;
    days: {
      name: string;
      estimatedMin: number;
      exercises: { exerciseId: string; sets: number; repMin: number; repMax: number }[];
    }[];
  };
  volume: MuscleVolume[];
  hints: RoutineHint[];
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export interface E1rmPointDto {
  localDate: string;
  sessionId: string;
  e1rmKg: number;
  weightKg: number;
  reps: number;
  lowConfidence: boolean;
  isPr: boolean;
}

export interface E1rmSeriesDto {
  exerciseId: string;
  points: E1rmPointDto[];
  /** Rolling max over the last 3 sessions, aligned with points. */
  trend: number[];
}

export interface RepPrRowDto {
  weightKg: number;
  reps: number;
  localDate: string;
}

export interface MuscleVolumeWeekDto {
  weekStart: string;
  /** VolumeGroup → fractional sets completed that week. */
  sets: Record<string, number>;
}

export interface MonthlyRecapDto {
  month: string; // "YYYY-MM"
  sessions: number;
  sessionsGoal: number;
  weeksMet: number;
  weeksTotal: number;
  streak: number;
  prCount: number;
  topGains: { exerciseId: string; fromKg: number; toKg: number; pct: number }[];
  setsByGroup: { group: string; sets: number; prevSets: number }[];
  bodyweight: { startKg: number | null; endKg: number | null };
}

export interface BodyweightPointDto {
  localDate: string;
  weightKg: number;
}

export type PrDto = PersonalRecord;
