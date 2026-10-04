import { describe, expect, it, vi } from 'vitest';
import type {
  CoachedSessionRow,
  CoachingInvite,
  Exercise,
  RoutineWithDays,
} from '@chefer/database';
import { ExerciseTrackingType, type NextTargetDto, type Suggestion } from '@chefer/types';
import {
  inviteStateOf,
  toCoachedWorkoutDto,
  toInviteDto,
  toRoutineDtoForTrainer,
  toTrainerRoutineDto,
} from './coaching-dto.mappers.js';

// gym/mappers.ts → exercise-library/ensure.ts → lib/env.ts (throws without secrets).
vi.mock('../../lib/env.js', () => ({ env: {} }));

// ─── Allow-list DTOs (spec §7.2, INV-2 pattern) ───────────────────────────────
// Every trainer-facing DTO is built from a FULLY populated row: private session
// and exercise notes, calorie estimates, heart rate, the client's own routine
// note, prescriptions, swaps... The exact deep key set of the result is asserted,
// so a new field reaching a trainer has to be added here on purpose.

const CLIENT = 'cclient00000000000000001';
const TRAINER = 'ctrainer0000000000000001';
const T0 = new Date('2026-10-01T09:00:00Z');

function keyPaths(value: unknown, prefix = ''): string[] {
  if (Array.isArray(value)) return [...new Set(value.flatMap((v) => keyPaths(v, prefix)))];
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => [
      `${prefix}${k}`,
      ...keyPaths(v, `${prefix}${k}.`),
    ]);
  }
  return [];
}

const set = (position: number, over: object = {}) => ({
  id: `set${position}`,
  sessionExerciseId: 'sx1',
  position,
  weightKg: 80,
  reps: 6,
  isWarmup: false,
  completedAt: new Date('2026-10-02T10:10:00Z'),
  durationSec: null,
  distanceM: null,
  intensityRpe: null,
  resistanceLevel: null,
  inclinePct: null,
  caloriesKcal: 321,
  avgHeartRateBpm: 151,
  ...over,
});

function session(over: Partial<CoachedSessionRow> = {}): CoachedSessionRow {
  return {
    id: 'sess1',
    userId: CLIENT,
    routineId: 'r1',
    routineDayId: 'd1',
    name: 'Day A',
    status: 'COMPLETED',
    startedAt: new Date('2026-10-02T10:00:00Z'),
    finishedAt: new Date('2026-10-02T10:50:00Z'),
    localDate: '2026-10-02',
    isDeload: false,
    notes: 'SECRET-SESSION-NOTE',
    clientUpdatedAt: new Date('2026-10-02T10:50:00Z'),
    engineVersion: 1,
    rotationAppliedAt: new Date(),
    exercises: [
      {
        id: 'sx2',
        sessionId: 'sess1',
        exerciseId: 'run',
        routineExerciseId: 're2',
        position: 1,
        repMin: 1,
        repMax: 1,
        targetRir: 0,
        restSec: 0,
        skipped: false,
        swappedFromId: 'swapped-from',
        lastSetRir: null,
        prescription: { SECRET: 'prescription' },
        notes: 'SECRET-EXERCISE-NOTE-2',
        supersetGroup: null,
        exercise: {
          id: 'run',
          name: 'Treadmill',
          ownerId: null,
          trackingType: 'DURATION_DISTANCE',
        },
        sets: [
          set(0, {
            id: 'c0',
            weightKg: 0,
            reps: 0,
            durationSec: 1500,
            distanceM: 5000,
            intensityRpe: 7,
            resistanceLevel: 3,
            inclinePct: 1,
          }),
        ],
      },
      {
        id: 'sx1',
        sessionId: 'sess1',
        exerciseId: 'squat',
        routineExerciseId: 're1',
        position: 0,
        repMin: 6,
        repMax: 8,
        targetRir: 2,
        restSec: 120,
        skipped: false,
        swappedFromId: null,
        lastSetRir: 2,
        prescription: { SECRET: 'prescription' },
        notes: 'SECRET-EXERCISE-NOTE',
        supersetGroup: 'A',
        exercise: { id: 'squat', name: 'Back squat', ownerId: null, trackingType: 'WEIGHT_REPS' },
        sets: [set(1, { isWarmup: true, weightKg: 40 }), set(0), set(2, { completedAt: null })],
      },
      {
        id: 'sx3',
        sessionId: 'sess1',
        exerciseId: 'row',
        routineExerciseId: null,
        position: 2,
        repMin: 8,
        repMax: 10,
        targetRir: 2,
        restSec: 90,
        skipped: true,
        swappedFromId: null,
        lastSetRir: null,
        prescription: {},
        notes: null,
        supersetGroup: null,
        exercise: { id: 'row', name: 'Barbell row', ownerId: CLIENT, trackingType: 'WEIGHT_REPS' },
        sets: [],
      },
    ],
    ...over,
  } as unknown as CoachedSessionRow;
}

const ALL = new Set<ExerciseTrackingType>(Object.values(ExerciseTrackingType));
const STRENGTH = new Set<ExerciseTrackingType>([
  ExerciseTrackingType.WEIGHT_REPS,
  ExerciseTrackingType.BODYWEIGHT_REPS,
  ExerciseTrackingType.DURATION,
]);

describe('toCoachedWorkoutDto', () => {
  it('has exactly the allow-listed keys, and nothing private anywhere', () => {
    const dto = toCoachedWorkoutDto(session(), ALL);
    expect(keyPaths(dto).sort()).toEqual(
      [
        'id',
        'name',
        'localDate',
        'startedAt',
        'finishedAt',
        'durationMin',
        'isDeload',
        'exercises',
        'exercises.exerciseId',
        'exercises.name',
        'exercises.skipped',
        'exercises.lastSetRir',
        'exercises.sets',
        'exercises.sets.weightKg',
        'exercises.sets.reps',
        'exercises.sets.isWarmup',
        'exercises.sets.completed',
        'exercises.sets.durationSec',
        'exercises.sets.distanceM',
        'exercises.sets.intensityRpe',
        'exercises.sets.resistanceLevel',
        'exercises.sets.inclinePct',
      ].sort(),
    );
    const json = JSON.stringify(dto);
    for (const leak of [
      'SECRET',
      'caloriesKcal',
      'avgHeartRateBpm',
      'prescription',
      'swapped',
      '321',
      '151',
    ]) {
      expect(json).not.toContain(leak);
    }
  });

  it('orders exercises and sets by position, marks warm-ups and unticked sets, keeps skipped exercises', () => {
    const dto = toCoachedWorkoutDto(session(), ALL);
    expect(dto.exercises.map((e) => e.exerciseId)).toEqual(['squat', 'run', 'row']);
    expect(dto.exercises[0]?.sets).toEqual([
      { weightKg: 80, reps: 6, isWarmup: false, completed: true },
      { weightKg: 40, reps: 6, isWarmup: true, completed: true },
      { weightKg: 80, reps: 6, isWarmup: false, completed: false },
    ]);
    expect(dto.exercises[0]?.lastSetRir).toBe(2);
    expect(dto.exercises[2]).toMatchObject({ skipped: true, sets: [] });
    expect(dto.durationMin).toBe(50);
  });

  it('a strength set has no cardio keys (omitted, not null)', () => {
    const dto = toCoachedWorkoutDto(session(), ALL);
    expect(Object.keys(dto.exercises[0]?.sets[0] ?? {}).sort()).toEqual(
      ['completed', 'isWarmup', 'reps', 'weightKg'].sort(),
    );
    expect(dto.exercises[1]?.sets[0]).toMatchObject({ durationSec: 1500, distanceM: 5000 });
  });

  it('drops exercises of a type the trainer’s client level cannot show; the workout stays', () => {
    const dto = toCoachedWorkoutDto(session(), STRENGTH);
    expect(dto.exercises.map((e) => e.exerciseId)).toEqual(['squat', 'row']);
  });

  it('an unfinished or negative duration is null', () => {
    expect(toCoachedWorkoutDto(session({ finishedAt: null }), ALL)).toMatchObject({
      finishedAt: null,
      durationMin: null,
    });
    expect(
      toCoachedWorkoutDto(session({ finishedAt: new Date('2026-10-02T09:00:00Z') }), ALL)
        .durationMin,
    ).toBeNull();
  });
});

describe('invites', () => {
  const invite = (over: Partial<CoachingInvite> = {}): CoachingInvite => ({
    code: 'ABCDEFGHJK',
    trainerId: TRAINER,
    label: 'Maria',
    createdAt: T0,
    expiresAt: new Date('2026-10-15T09:00:00Z'),
    usedAt: null,
    usedById: null,
    revokedAt: null,
    ...over,
  });
  const NOW = new Date('2026-10-04T00:00:00Z');

  it('the URL is APP_URL/coaching/join/<code> and the DTO has no trainer id or used-by', () => {
    const dto = toInviteDto(invite({ usedById: CLIENT }), NOW, 'https://chefer.example//');
    expect(dto.url).toBe('https://chefer.example/coaching/join/ABCDEFGHJK');
    expect(Object.keys(dto).sort()).toEqual(
      ['code', 'createdAt', 'expiresAt', 'label', 'state', 'url'].sort(),
    );
  });

  it('state: USED beats REVOKED beats EXPIRED beats OPEN; the expiry instant itself is expired', () => {
    expect(inviteStateOf(invite(), NOW)).toBe('OPEN');
    expect(inviteStateOf(invite({ expiresAt: NOW }), NOW)).toBe('EXPIRED');
    expect(inviteStateOf(invite({ revokedAt: NOW, expiresAt: NOW }), NOW)).toBe('REVOKED');
    expect(inviteStateOf(invite({ usedAt: NOW, revokedAt: NOW }), NOW)).toBe('USED');
  });
});

// ─── The routine ──────────────────────────────────────────────────────────────

const exercise = (id: string, ownerId: string | null, trackingType = 'WEIGHT_REPS'): Exercise =>
  ({
    id,
    name: `Exercise ${id}`,
    ownerId,
    category: 'COMPOUND',
    movementPattern: 'SQUAT',
    equipment: 'BARBELL',
    loadType: 'WEIGHTED',
    primaryMuscles: ['quads'],
    secondaryMuscles: [],
    repMin: 6,
    repMax: 10,
    restSec: 120,
    incrementKg: 2.5,
    perHand: false,
    isLowerBody: true,
    isTimed: false,
    swapGroup: null,
    trackingType,
    aliases: [],
    cues: ['SECRET-CUE-NOT-IN-META'],
    mistakes: [],
    blurb: null,
    imageKeys: [],
    videoId: null,
    videoStartSec: null,
    videoChannel: null,
    archivedAt: null,
    createdAt: T0,
    updatedAt: T0,
  }) as unknown as Exercise;

function routineRow(over: Partial<RoutineWithDays> = {}): RoutineWithDays {
  const row = (id: string, exerciseId: string, over: object = {}) => ({
    id,
    dayId: 'd1',
    exerciseId,
    position: 0,
    sets: 3,
    repMin: 6,
    repMax: 8,
    targetRir: 2,
    restSec: 120,
    supersetGroup: null,
    notes: 'SECRET-CLIENT-ROUTINE-NOTE',
    trainerNote: null,
    lastEditedById: null,
    lastEditedAt: null,
    ...over,
  });
  return {
    id: 'r1',
    userId: CLIENT,
    name: 'Plan',
    templateKey: null,
    isActive: true,
    nextDayId: 'd1',
    version: 4,
    archivedAt: null,
    createdAt: T0,
    updatedAt: new Date('2026-10-03T00:00:00Z'),
    lastEditedById: CLIENT,
    lastEditedAt: new Date('2026-10-03T08:00:00Z'),
    days: [
      {
        id: 'd1',
        routineId: 'r1',
        position: 0,
        name: 'Day A',
        plannedWeekday: 0,
        exercises: [
          row('re1', 'squat', {
            trainerNote: 'knees out',
            lastEditedById: TRAINER,
            lastEditedAt: new Date('2026-10-02T08:00:00Z'),
          }),
          row('re2', 'custom-mine', {
            position: 1,
            lastEditedById: CLIENT,
            lastEditedAt: new Date('2026-10-03T08:00:00Z'),
          }),
          row('re3', 'run', { position: 2, lastEditedById: CLIENT, lastEditedAt: T0 }),
        ],
      },
    ],
    ...over,
  };
}

const suggestion = {
  kind: 'hold',
  weightKg: 60,
  reps: [8],
  sets: 1,
  reasonCode: 'ADD_REPS',
} as unknown as Suggestion;
const next = (): NextTargetDto => ({
  repBucket: '6-8',
  suggestion,
  override: null,
  lastDoneDate: null,
});

describe('toTrainerRoutineDto', () => {
  const input = () => ({
    row: routineRow(),
    linkStartedAt: new Date('2026-10-02T00:00:00Z'),
    clientId: CLIENT,
    clientName: 'Maria',
    exercises: [
      exercise('squat', null),
      exercise('custom-mine', CLIENT),
      exercise('run', null, 'DURATION_DISTANCE'),
    ],
    next: new Map([['re1', next()]]),
  });

  it('has exactly the allow-listed keys; the client’s own notes and the exercise cues never appear', () => {
    const dto = toTrainerRoutineDto(input());
    const paths = keyPaths(dto);
    expect(paths).not.toContain('notes');
    expect(JSON.stringify(dto)).not.toContain('SECRET');
    expect(
      keyPaths({
        ...dto,
        days: dto.days.map((d) => ({ ...d, exercises: d.exercises.slice(0, 1) })),
      })
        .filter((p) => p.startsWith('days.exercises.'))
        .sort(),
    ).toEqual(
      [
        'days.exercises.id',
        'days.exercises.exerciseId',
        'days.exercises.position',
        'days.exercises.sets',
        'days.exercises.repMin',
        'days.exercises.repMax',
        'days.exercises.targetRir',
        'days.exercises.restSec',
        'days.exercises.supersetGroup',
        'days.exercises.trainerNote',
        'days.exercises.lastEditedByOther',
        'days.exercises.next',
        'days.exercises.next.repBucket',
        'days.exercises.next.suggestion',
        'days.exercises.next.suggestion.kind',
        'days.exercises.next.suggestion.weightKg',
        'days.exercises.next.suggestion.reps',
        'days.exercises.next.suggestion.sets',
        'days.exercises.next.suggestion.reasonCode',
        'days.exercises.next.override',
        'days.exercises.next.lastDoneDate',
      ].sort(),
    );
  });

  it('"Changed by <client>": only changes the CLIENT made after the link started', () => {
    const dto = toTrainerRoutineDto(input());
    const rows = dto.days[0]?.exercises ?? [];
    // re1 was last changed by the trainer: nothing to show the trainer.
    expect(rows[0]?.lastEditedByOther).toBeNull();
    // re2 was changed by the client after the link started.
    expect(rows[1]?.lastEditedByOther).toEqual({ name: 'Maria', at: '2026-10-03T08:00:00.000Z' });
    // re3 was changed by the client BEFORE the link: not surfaced.
    expect(rows[2]?.lastEditedByOther).toBeNull();
    expect(dto.lastEditedByOther).toEqual({ name: 'Maria', at: '2026-10-03T08:00:00.000Z' });
  });

  it('a stamp whose editor account is gone is not the client', () => {
    const row = routineRow({
      lastEditedById: null,
      lastEditedAt: new Date('2026-10-03T08:00:00Z'),
    });
    expect(toTrainerRoutineDto({ ...input(), row }).lastEditedByOther).toBeNull();
  });

  it('names exercises used by the routine, marks the client’s own, and gives the next-session panel to strength rows only', () => {
    const dto = toTrainerRoutineDto(input());
    expect(dto.exercises.map((e) => [e.id, e.isCustom])).toEqual([
      ['squat', false],
      ['custom-mine', true],
      ['run', false],
    ]);
    expect(dto.days[0]?.exercises.map((e) => e.next !== null)).toEqual([true, false, false]);
    expect(JSON.stringify(dto.exercises)).not.toContain('SECRET-CUE');
  });
});

describe('toRoutineDtoForTrainer (the CONFLICT payload)', () => {
  it('names the client on what they changed, blanks their notes, keeps the trainer notes', () => {
    const dto = toRoutineDtoForTrainer(routineRow(), TRAINER, 'Maria');
    expect(dto.lastEditedByOther).toEqual({ name: 'Maria', at: '2026-10-03T08:00:00.000Z' });
    const rows = dto.days[0]?.exercises ?? [];
    expect(rows[0]?.lastEditedByOther).toBeUndefined(); // the trainer's own change
    expect(rows[1]?.lastEditedByOther?.name).toBe('Maria');
    expect(rows[0]?.trainerNote).toBe('knees out');
    expect(rows.every((e) => e.notes === null)).toBe(true);
    expect(JSON.stringify(dto)).not.toContain('SECRET');
  });
});
