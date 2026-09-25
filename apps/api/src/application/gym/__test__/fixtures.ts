// Shared row/doc builders for the gym service tests (not a test file itself).
import { vi } from 'vitest';
import type {
  Exercise,
  GymProfile,
  IWorkoutSessionRepository,
  RoutineWithDays,
  SessionDocWriteData,
  SessionWithChildren,
  TrainingPause,
  UpsertSessionResult,
} from '@chefer/database';
import type { ProgressionState, Suggestion, WorkoutSessionDoc } from '@chefer/types';

export const T0 = new Date('2026-09-01T10:00:00.000Z');

export function exerciseRow(id: string, over: Partial<Exercise> = {}): Exercise {
  return {
    id,
    ownerId: null,
    name: id,
    aliases: [],
    category: 'COMPOUND',
    movementPattern: 'horizontal-push',
    equipment: 'BARBELL',
    loadType: 'WEIGHTED',
    primaryMuscles: ['chest'],
    secondaryMuscles: ['triceps'],
    repMin: 6,
    repMax: 10,
    restSec: 180,
    incrementKg: 2.5,
    perHand: false,
    isLowerBody: false,
    isTimed: false,
    swapGroup: null,
    cues: [],
    mistakes: [],
    blurb: null,
    imageKeys: [],
    videoId: null,
    videoStartSec: null,
    videoChannel: null,
    contentVersion: 1,
    archivedAt: null,
    createdAt: T0,
    updatedAt: T0,
    ...over,
  };
}

export function profileRow(over: Partial<GymProfile> = {}): GymProfile {
  return {
    userId: 'u1',
    experience: 'BEGINNER',
    equipmentAccess: 'FULL_GYM',
    unit: 'KG',
    weeklyGoal: 3,
    goalHistory: [{ fromWeek: '2026-08-31', goal: 3 }],
    barWeightKg: 20,
    platePairsKg: [25, 20, 15, 10, 5, 2.5, 1.25],
    dumbbellsKg: [10, 12, 14],
    machineStepKg: 5,
    cableStepKg: 2.5,
    hasDipBelt: false,
    microPlates: false,
    reminderEnabled: false,
    reminderTime: null,
    offerState: {},
    setupCompletedAt: T0,
    createdAt: T0,
    updatedAt: T0,
    ...over,
  };
}

/** Two-day routine: day-a (bench 3×6-10), day-b (squat 3×8-12). nextDayId = day-a. */
export function routineRow(over: Partial<RoutineWithDays> = {}): RoutineWithDays {
  return {
    id: 'r1',
    userId: 'u1',
    name: 'Upper/Lower',
    templateKey: 'fb2-beginner',
    isActive: true,
    nextDayId: 'day-a',
    version: 1,
    archivedAt: null,
    createdAt: T0,
    updatedAt: T0,
    days: [
      {
        id: 'day-a',
        routineId: 'r1',
        position: 0,
        name: 'Day A',
        plannedWeekday: 0,
        exercises: [
          {
            id: 're-bench',
            dayId: 'day-a',
            exerciseId: 'bench',
            position: 0,
            sets: 3,
            repMin: 6,
            repMax: 10,
            targetRir: 2,
            restSec: 180,
            supersetGroup: null,
            notes: null,
          },
        ],
      },
      {
        id: 'day-b',
        routineId: 'r1',
        position: 1,
        name: 'Day B',
        plannedWeekday: 3,
        exercises: [
          {
            id: 're-squat',
            dayId: 'day-b',
            exerciseId: 'squat',
            position: 0,
            sets: 3,
            repMin: 8,
            repMax: 12,
            targetRir: 2,
            restSec: 180,
            supersetGroup: null,
            notes: null,
          },
        ],
      },
    ],
    ...over,
  };
}

export function suggestion(over: Partial<Suggestion> = {}): Suggestion {
  return {
    kind: 'hold',
    weightKg: 60,
    reps: [8, 8, 8],
    sets: 3,
    reasonCode: 'ADD_REPS',
    inputs: {},
    deltaKg: 0,
    engineVersion: 1,
    ...over,
  };
}

export function progressionState(over: Partial<ProgressionState> = {}): ProgressionState {
  return {
    workingWeightKg: 60,
    repTargets: [8, 8, 8],
    sets: 3,
    missStreak: 0,
    stallCount: 0,
    resetDates: [],
    calibrating: false,
    calibrationExposures: 0,
    justIncreased: false,
    preBreakWeightKg: null,
    lastExposureDate: '2026-09-01',
    lastTotalReps: 24,
    next: suggestion(),
    ...over,
  };
}

export function pauseRow(over: Partial<TrainingPause> = {}): TrainingPause {
  return {
    id: 'p1',
    userId: 'u1',
    startDate: '2026-09-20',
    endDate: '2026-09-30',
    reason: 'vacation',
    createdAt: T0,
    ...over,
  };
}

let uuidCounter = 0;
/** Deterministic v4-shaped UUIDs (the Zod schema is not applied in service tests). */
export function uuid(): string {
  uuidCounter++;
  return `00000000-0000-4000-8000-${String(uuidCounter).padStart(12, '0')}`;
}

export function sessionDoc(over: Partial<WorkoutSessionDoc> = {}): WorkoutSessionDoc {
  return {
    schemaVersion: 1,
    id: uuid(),
    routineId: 'r1',
    routineDayId: 'day-a',
    name: 'Day A',
    status: 'COMPLETED',
    startedAt: '2026-09-02T17:00:00.000Z',
    finishedAt: '2026-09-02T18:00:00.000Z',
    localDate: '2026-09-02',
    isDeload: false,
    notes: null,
    clientUpdatedAt: '2026-09-02T18:00:00.000Z',
    engineVersion: 1,
    exercises: [
      {
        id: uuid(),
        exerciseId: 'bench',
        routineExerciseId: 're-bench',
        position: 0,
        repMin: 6,
        repMax: 10,
        targetRir: 2,
        restSec: 180,
        skipped: false,
        swappedFromId: null,
        lastSetRir: 2,
        prescription: suggestion(),
        notes: null,
        sets: [
          {
            id: uuid(),
            position: 0,
            weightKg: 60,
            reps: 8,
            isWarmup: false,
            completedAt: '2026-09-02T17:10:00.000Z',
          },
        ],
      },
    ],
    ...over,
  };
}

/** Stored session rows (what the repository returns) for a doc. */
export function sessionRow(doc: WorkoutSessionDoc, userId = 'u1'): SessionWithChildren {
  return {
    id: doc.id,
    userId,
    routineId: doc.routineId,
    routineDayId: doc.routineDayId,
    name: doc.name,
    status: doc.status,
    startedAt: new Date(doc.startedAt),
    finishedAt: doc.finishedAt ? new Date(doc.finishedAt) : null,
    localDate: doc.localDate,
    isDeload: doc.isDeload,
    notes: doc.notes,
    clientUpdatedAt: new Date(doc.clientUpdatedAt),
    engineVersion: doc.engineVersion,
    rotationAppliedAt: null,
    createdAt: T0,
    updatedAt: T0,
    exercises: doc.exercises.map((e) => ({
      id: e.id,
      sessionId: doc.id,
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
      prescription: { ...e.prescription },
      notes: e.notes,
      sets: e.sets.map((s) => ({
        id: s.id,
        sessionExerciseId: e.id,
        position: s.position,
        weightKg: s.weightKg,
        reps: s.reps,
        isWarmup: s.isWarmup,
        completedAt: s.completedAt ? new Date(s.completedAt) : null,
      })),
    })),
  };
}

/**
 * In-memory IWorkoutSessionRepository with the SAME write semantics as the
 * Prisma implementation (ownership → stale → unchanged → write → once-only
 * rotation claim), so the service's sync behaviour can be tested end-to-end
 * without a database. `routinePointers` plays the routines table.
 */
export interface StoredSession {
  userId: string;
  doc: SessionDocWriteData;
  rotationAppliedAt: Date | null;
}

export function makeMemorySessionRepo(routinePointers = new Map<string, string | null>()) {
  type Stored = StoredSession;
  const rows = new Map<string, Stored>();
  const writes: SessionDocWriteData[] = [];

  const snapshot = (s: Stored) => ({
    status: s.doc.status,
    exerciseIds: [...new Set(s.doc.exercises.map((e) => e.exerciseId))],
  });

  const repo: IWorkoutSessionRepository = {
    upsertDocument: vi.fn((userId: string, doc: SessionDocWriteData, opts) => {
      const existing = rows.get(doc.id);
      let result: UpsertSessionResult;
      const storedAt = existing?.doc.clientUpdatedAt.getTime();
      if (existing && existing.userId !== userId) result = { status: 'foreign' };
      else if (existing && storedAt !== undefined && storedAt > doc.clientUpdatedAt.getTime()) {
        result = { status: 'stale' };
      } else if (existing && storedAt === doc.clientUpdatedAt.getTime()) {
        result = { status: 'unchanged', previous: snapshot(existing) };
      } else {
        const previous = existing ? snapshot(existing) : null;
        const stored: Stored = {
          userId,
          doc,
          rotationAppliedAt: existing?.rotationAppliedAt ?? null,
        };
        rows.set(doc.id, stored);
        writes.push(doc);
        let rotationAdvanced = false;
        if (doc.status === 'COMPLETED' && opts.rotation && !stored.rotationAppliedAt) {
          stored.rotationAppliedAt = new Date();
          routinePointers.set(opts.rotation.routineId, opts.rotation.nextDayId);
          rotationAdvanced = true;
        }
        result = { status: 'written', previous, rotationAdvanced };
      }
      return Promise.resolve(result);
    }),
    findByIdForUser: vi.fn().mockResolvedValue(null),
    listForUser: vi.fn().mockResolvedValue([]),
    findCompleted: vi.fn().mockResolvedValue([]),
    findCompletedDates: vi.fn().mockResolvedValue([]),
    discard: vi.fn((userId: string, id: string) => {
      const s = rows.get(id);
      if (s?.userId !== userId) return Promise.resolve(null);
      const prev = snapshot(s);
      s.doc = { ...s.doc, status: 'DISCARDED' };
      return Promise.resolve(prev);
    }),
    delete: vi.fn((userId: string, id: string) => {
      const s = rows.get(id);
      if (s?.userId !== userId) return Promise.resolve(null);
      rows.delete(id);
      return Promise.resolve(snapshot(s));
    }),
  };
  return { repo, rows, writes, routinePointers };
}
