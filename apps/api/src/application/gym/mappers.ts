import type {
  Exercise,
  GymProfile,
  Prisma,
  RoutineWithDays,
  SessionWithChildren,
} from '@chefer/database';
import {
  DEFAULT_DUMBBELLS_KG,
  DEFAULT_PLATE_PAIRS_KG,
  MUSCLES,
  suggestionSchema,
  type EquipmentProfile,
  type ExerciseDto,
  type ExerciseMeta,
  type GoalHistoryEntry,
  type GymProfileDto,
  type Muscle,
  type ProgressionOverride,
  type ProgressionState,
  type RoutineDto,
  type WorkoutSessionDoc,
} from '@chefer/types';
import type { ExerciseLookup } from '@chefer/utils';
import { exerciseImageUrl } from '../../lib/exercise-library/ensure.js';

// ─── Gym row ↔ DTO mapping ────────────────────────────────────────────────────
// All outputs use ISO strings (never Date) so they survive the phone's JSON
// offline cache unchanged (dto.ts header).

const MUSCLE_SET = new Set<string>(MUSCLES);
const isMuscle = (m: string): m is Muscle => MUSCLE_SET.has(m);

export function toExerciseMeta(row: Exercise): ExerciseMeta {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    movementPattern: row.movementPattern,
    equipment: row.equipment,
    loadType: row.loadType,
    primaryMuscles: row.primaryMuscles.filter(isMuscle),
    secondaryMuscles: row.secondaryMuscles.filter(isMuscle),
    repMin: row.repMin,
    repMax: row.repMax,
    restSec: row.restSec,
    incrementKg: row.incrementKg,
    perHand: row.perHand,
    isLowerBody: row.isLowerBody,
    isTimed: row.isTimed,
    swapGroup: row.swapGroup,
  };
}

export function toExerciseDto(row: Exercise): ExerciseDto {
  return {
    ...toExerciseMeta(row),
    ownerId: row.ownerId,
    aliases: row.aliases,
    cues: row.cues,
    mistakes: row.mistakes,
    blurb: row.blurb,
    images: row.imageKeys.map(exerciseImageUrl),
    videoId: row.videoId,
    videoStartSec: row.videoStartSec,
    videoChannel: row.videoChannel,
    archived: row.archivedAt !== null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Engine lookup over DB rows (curated + the user's custom exercises). */
export function lookupFromRows(rows: readonly Exercise[]): {
  lookup: ExerciseLookup;
  metas: Map<string, ExerciseMeta>;
} {
  const metas = new Map(rows.map((r) => [r.id, toExerciseMeta(r)]));
  return { lookup: (id) => metas.get(id), metas };
}

export function toRoutineDto(row: RoutineWithDays): RoutineDto {
  return {
    id: row.id,
    name: row.name,
    templateKey: row.templateKey,
    isActive: row.isActive,
    nextDayId: row.nextDayId,
    version: row.version,
    archived: row.archivedAt !== null,
    updatedAt: row.updatedAt.toISOString(),
    days: row.days.map((d) => ({
      id: d.id,
      position: d.position,
      name: d.name,
      plannedWeekday: d.plannedWeekday,
      exercises: d.exercises.map((e) => ({
        id: e.id,
        exerciseId: e.exerciseId,
        position: e.position,
        sets: e.sets,
        repMin: e.repMin,
        repMax: e.repMax,
        targetRir: e.targetRir,
        restSec: e.restSec,
        supersetGroup: e.supersetGroup,
        notes: e.notes,
      })),
    })),
  };
}

export function toProfileDto(row: GymProfile): GymProfileDto {
  return {
    experience: row.experience,
    equipmentAccess: row.equipmentAccess,
    unit: row.unit,
    weeklyGoal: row.weeklyGoal,
    barWeightKg: row.barWeightKg,
    platePairsKg: row.platePairsKg,
    dumbbellsKg: row.dumbbellsKg,
    machineStepKg: row.machineStepKg,
    cableStepKg: row.cableStepKg,
    hasDipBelt: row.hasDipBelt,
    microPlates: row.microPlates,
    reminderEnabled: row.reminderEnabled,
    reminderTime: row.reminderTime,
    setupCompletedAt: row.setupCompletedAt?.toISOString() ?? null,
  };
}

/** Inventory used when a user has no gym profile yet (setup not finished). */
export const DEFAULT_EQUIPMENT_PROFILE: EquipmentProfile = {
  unit: 'KG',
  barWeightKg: 20,
  platePairsKg: [...DEFAULT_PLATE_PAIRS_KG],
  dumbbellsKg: [...DEFAULT_DUMBBELLS_KG],
  machineStepKg: 5,
  cableStepKg: 2.5,
  hasDipBelt: false,
  microPlates: false,
};

export function toEquipmentProfile(row: GymProfile | null): EquipmentProfile {
  if (!row) return DEFAULT_EQUIPMENT_PROFILE;
  return {
    unit: row.unit,
    barWeightKg: row.barWeightKg,
    platePairsKg: row.platePairsKg,
    dumbbellsKg: row.dumbbellsKg,
    machineStepKg: row.machineStepKg,
    cableStepKg: row.cableStepKg,
    hasDipBelt: row.hasDipBelt,
    microPlates: row.microPlates,
  };
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

/** Stored rows → the same WorkoutSessionDoc shape the phone uploads (schemaVersion 1). */
export function toSessionDoc(row: SessionWithChildren): WorkoutSessionDoc {
  return {
    schemaVersion: 1,
    id: row.id,
    routineId: row.routineId,
    routineDayId: row.routineDayId,
    name: row.name,
    status: row.status,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
    localDate: row.localDate,
    isDeload: row.isDeload,
    notes: row.notes,
    clientUpdatedAt: row.clientUpdatedAt.toISOString(),
    engineVersion: row.engineVersion,
    exercises: row.exercises.map((e) => ({
      id: e.id,
      exerciseId: e.exerciseId,
      routineExerciseId: e.routineExerciseId,
      position: e.position,
      repMin: e.repMin,
      repMax: e.repMax,
      targetRir: e.targetRir,
      restSec: e.restSec,
      skipped: e.skipped,
      swappedFromId: e.swappedFromId,
      lastSetRir: e.lastSetRir,
      // Validated by suggestionSchema on the way in; parse again on the way
      // out so a hand-edited or legacy row can never leak a malformed shape.
      prescription: suggestionSchema.parse(e.prescription),
      notes: e.notes,
      sets: e.sets.map((s) => ({
        id: s.id,
        position: s.position,
        weightKg: s.weightKg,
        reps: s.reps,
        isWarmup: s.isWarmup,
        completedAt: s.completedAt?.toISOString() ?? null,
      })),
    })),
  };
}

// ─── JSON columns ─────────────────────────────────────────────────────────────
// Prisma types Json columns as JsonValue. The shapes below are written only
// by this service layer, so reading them back is a trusted narrowing (the
// same `as unknown as` convention the tracker/shopping-list services use).

export function readProgressionState(json: Prisma.JsonValue): ProgressionState {
  return json as unknown as ProgressionState;
}

export function readOverride(json: Prisma.JsonValue | null): ProgressionOverride | null {
  if (json === null || typeof json !== 'object' || Array.isArray(json)) return null;
  return json as unknown as ProgressionOverride;
}

export function readGoalHistory(json: Prisma.JsonValue): GoalHistoryEntry[] {
  return Array.isArray(json) ? (json as unknown as GoalHistoryEntry[]) : [];
}

/**
 * GymProfile.offerState — offer bookkeeping owned by the API:
 * - `dismissed`: offer key → ISO time the user dismissed it
 * - `deload`: the active user-started deload window (localDates, inclusive)
 * - `knownWeightsKg`: setup's "I know my weights" answers, kept so a
 *   progression recompute (foldHistory with no exposures) reproduces the
 *   seeded starting weight instead of falling back to calibration.
 */
export interface GymOfferState {
  dismissed?: Record<string, string>;
  deload?: { startDate: string; endDate: string } | null;
  knownWeightsKg?: Record<string, number>;
}

export function readOfferState(json: Prisma.JsonValue | undefined): GymOfferState {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return {};
  return json;
}

/** Plain JSON-safe data → Prisma input (all our shapes are JSON by construction). */
export function toJson(value: object): Prisma.InputJsonValue {
  return value;
}

// ─── Dates ────────────────────────────────────────────────────────────────────

/** Server fallback for the device-local date when a client doesn't send `today`. */
export function serverToday(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}
