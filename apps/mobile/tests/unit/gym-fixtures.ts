import type { ExerciseDto, GymBootstrap, GymProfileDto, WorkoutSessionDoc } from '@chefer/types';

/** Deterministic, schema-valid UUIDs: uuid(1) → 00000000-0000-4000-8000-000000000001. */
export function uuid(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

export function makeDoc(n: number, overrides: Partial<WorkoutSessionDoc> = {}): WorkoutSessionDoc {
  return {
    schemaVersion: 1,
    id: uuid(n),
    routineId: null,
    routineDayId: null,
    name: `Workout ${n}`,
    status: 'COMPLETED',
    startedAt: '2026-09-24T08:00:00.000Z',
    finishedAt: '2026-09-24T09:00:00.000Z',
    localDate: '2026-09-24',
    isDeload: false,
    notes: null,
    clientUpdatedAt: '2026-09-24T09:00:00.000Z',
    engineVersion: 1,
    exercises: [],
    ...overrides,
  };
}

export const profile: GymProfileDto = {
  experience: 'BEGINNER',
  equipmentAccess: 'FULL_GYM',
  unit: 'KG',
  weeklyGoal: 3,
  barWeightKg: 20,
  platePairsKg: [25, 20, 15, 10, 5, 2.5, 1.25],
  dumbbellsKg: [],
  machineStepKg: 5,
  cableStepKg: 2.5,
  hasDipBelt: false,
  microPlates: false,
  reminderEnabled: false,
  reminderTime: null,
  setupCompletedAt: '2026-09-01T00:00:00.000Z',
  reminderTimes: {},
  quietNudgeDays: null,
};

export function makeExercise(id: string, name = id): ExerciseDto {
  return {
    id,
    name,
    category: 'COMPOUND',
    movementPattern: 'push',
    equipment: 'BARBELL',
    loadType: 'WEIGHTED',
    primaryMuscles: ['chest'],
    secondaryMuscles: [],
    repMin: 8,
    repMax: 12,
    restSec: 120,
    incrementKg: 2.5,
    perHand: false,
    isLowerBody: false,
    isTimed: false,
    swapGroup: null,
    ownerId: null,
    aliases: [],
    cues: [],
    mistakes: [],
    blurb: null,
    images: [],
    videoId: null,
    videoStartSec: null,
    videoChannel: null,
    archived: false,
    updatedAt: '2026-09-01T00:00:00.000Z',
  };
}

export function makeBootstrap(overrides: Partial<GymBootstrap> = {}): GymBootstrap {
  return {
    profile,
    activeRoutine: null,
    nextWorkout: null,
    library: [makeExercise('bench'), makeExercise('squat')],
    libraryCursor: '2026-09-20T00:00:00.000Z',
    progressions: [],
    recentSessions: [],
    weeks: [],
    streak: { current: 0, best: 0, flexTokens: 0, thisWeekSessions: 0, thisWeekGoal: 3 },
    offers: [],
    activePause: null,
    carryOver: [],
    bodyweightKg: null,
    serverTime: '2026-09-24T09:00:00.000Z',
    engineVersion: 1,
    ...overrides,
  };
}

type RenderedNode =
  | { props?: Record<string, unknown>; children?: readonly unknown[] }
  | string
  | null
  | undefined;

/** The photo URLs drawn inside a rendered element (MediaFrame's Image), in order. */
export function photosIn(element: unknown): string[] {
  const node = element as RenderedNode;
  if (typeof node === 'string' || node === null || node === undefined) return [];
  const source = node.props?.source as { uri?: unknown } | undefined;
  const own = typeof source?.uri === 'string' ? [source.uri] : [];
  return [...own, ...(node.children ?? []).flatMap((child) => photosIn(child))];
}
