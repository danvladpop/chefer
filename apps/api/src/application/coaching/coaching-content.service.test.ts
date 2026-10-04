import { describe, expect, it, vi } from 'vitest';
import type {
  CoachedSessionRow,
  CoachingLink,
  Exercise,
  GymProfile,
  RoutineWithDays,
} from '@chefer/database';
import { COACHING_LIMITS, type Suggestion } from '@chefer/types';
import { encodeCursor } from '@chefer/utils';
import type { CoachingAccess } from './coaching-access.service.js';
import {
  CoachingContentService,
  goalHistoryOf,
  workoutWindowStart,
} from './coaching-content.service.js';

// The trainer's reads (spec §7.2): the 28-day window, paging, adherence from
// dates only, exercise history, the next-session panel. Repositories are mocks.

// coaching-content.service.ts → gym services → lib/env.ts (throws without secrets).
vi.mock('../../lib/env.js', () => ({ env: {} }));

const TRAINER = 'ctrainer0000000000000001';
const CLIENT = 'cclient00000000000000001';
// The link started on Wed 7 Oct 2026: the window opens 28 days earlier, Wed 9 Sep.
const LINK = { startedAt: new Date('2026-10-07T09:00:00Z') } as CoachingLink;
const WINDOW_START = '2026-09-09';
const access = (link: CoachingLink | null = LINK): CoachingAccess => ({
  trainerId: TRAINER,
  clientId: CLIENT,
  scope: 'read',
  link,
});

const exercise = (id: string, trackingType = 'WEIGHT_REPS'): Exercise =>
  ({
    id,
    name: `Exercise ${id}`,
    ownerId: null,
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
    updatedAt: new Date(),
  }) as unknown as Exercise;

const sessionRow = (
  id: string,
  localDate: string,
  exerciseId = 'squat',
  trackingType = 'WEIGHT_REPS',
  skipped = false,
): CoachedSessionRow =>
  ({
    id,
    userId: CLIENT,
    name: 'Day A',
    status: 'COMPLETED',
    startedAt: new Date(`${localDate}T10:00:00Z`),
    finishedAt: new Date(`${localDate}T10:45:00Z`),
    localDate,
    isDeload: false,
    notes: 'SECRET',
    exercises: [
      {
        id: `${id}-x`,
        exerciseId,
        position: 0,
        skipped,
        lastSetRir: 2,
        notes: 'SECRET',
        exercise: { id: exerciseId, name: `Exercise ${exerciseId}`, ownerId: null, trackingType },
        sets: [
          {
            position: 0,
            weightKg: 60,
            reps: 8,
            isWarmup: false,
            completedAt: new Date(),
            durationSec: null,
            distanceM: null,
            intensityRpe: null,
            resistanceLevel: null,
            inclinePct: null,
            caloriesKcal: 99,
            avgHeartRateBpm: 140,
          },
        ],
      },
    ],
  }) as unknown as CoachedSessionRow;

const suggestion = (weightKg = 60): Suggestion => ({
  kind: 'hold',
  weightKg,
  reps: [8, 8, 8],
  sets: 3,
  reasonCode: 'ADD_REPS',
  inputs: {},
  deltaKg: 0,
  engineVersion: 1,
});

function setup(
  opts: { routine?: RoutineWithDays | null; exercises?: Exercise[]; progress?: object[] } = {},
) {
  const content = {
    listCompleted: vi.fn(async () => [] as CoachedSessionRow[]),
    listCompletedForExercise: vi.fn(async () => [] as CoachedSessionRow[]),
    lastWorkoutDates: vi.fn(),
    countSessions: vi.fn(),
    gymProfiles: vi.fn(),
    activeRoutineStamps: vi.fn(),
    userNames: vi.fn(
      async () =>
        new Map([[CLIENT, { id: CLIENT, firstName: 'Maria', lastName: 'Pop', name: null }]]),
    ),
  };
  const progression = { forCoach: vi.fn(async () => (opts.progress ?? []) as never) };
  const pauses = {
    listForUser: vi.fn(async () => [
      {
        id: 'p1',
        userId: CLIENT,
        startDate: '2026-10-05',
        endDate: '2026-10-06',
        reason: 'injury',
        createdAt: new Date(),
      },
    ]),
  };
  const sessions = {
    findCompletedDates: vi.fn(async () => ['2026-09-01', '2026-09-10', '2026-10-05', '2026-10-06']),
  };
  const service = new CoachingContentService({
    content,
    routines: { findActive: vi.fn(async () => opts.routine ?? null) },
    exercises: {
      findVisibleByIds: vi.fn(async (_u: string, ids: string[]) =>
        (opts.exercises ?? [exercise('squat'), exercise('run', 'DURATION_DISTANCE')]).filter((e) =>
          ids.includes(e.id),
        ),
      ),
    },
    pauses,
    sessions,
    gymProfiles: {
      findByUserId: vi.fn(
        async () =>
          ({
            weeklyGoal: 3,
            goalHistory: [],
            setupCompletedAt: new Date('2026-09-01T00:00:00Z'),
            createdAt: new Date('2026-09-01T00:00:00Z'),
          }) as unknown as GymProfile,
      ),
    },
    progression,
    now: () => new Date('2026-10-07T12:00:00Z'),
  });
  return { service, content, progression };
}

describe('workoutWindowStart / goalHistoryOf', () => {
  it('the window opens 28 days before the link started (Q-2)', () => {
    expect(workoutWindowStart(LINK)).toBe(WINDOW_START);
    expect(COACHING_LIMITS.workoutWindowDays).toBe(28);
  });

  it('anchors on the client-local start day: a join after 21:00 in Romania does not widen the window', () => {
    // 22:30 UTC on 7 Oct is 01:30 on 8 Oct in Bucharest: the 28 days start on 10 Sep, not 9 Sep.
    const link = {
      startedAt: new Date('2026-10-07T22:30:00Z'),
      startedOn: '2026-10-08',
    } as CoachingLink;
    expect(workoutWindowStart(link)).toBe('2026-09-10');
    expect(workoutWindowStart({ startedAt: link.startedAt, startedOn: null })).toBe('2026-09-09');
  });

  it('goal history: the stored one, else the profile goal from the first week', () => {
    expect(goalHistoryOf(null, '2026-09-07')).toEqual([{ fromWeek: '2026-09-07', goal: 3 }]);
    expect(
      goalHistoryOf({ weeklyGoal: 4, goalHistory: [] } as unknown as GymProfile, '2026-09-07'),
    ).toEqual([{ fromWeek: '2026-09-07', goal: 4 }]);
    expect(
      goalHistoryOf(
        {
          weeklyGoal: 4,
          goalHistory: [{ fromWeek: '2026-08-31', goal: 2 }],
        } as unknown as GymProfile,
        '2026-09-07',
      ),
    ).toEqual([{ fromWeek: '2026-08-31', goal: 2 }]);
  });
});

describe('workouts', () => {
  it('asks only for the window, pages by keyset and reports the next cursor', async () => {
    const { service, content } = setup();
    content.listCompleted.mockResolvedValue([
      sessionRow('s3', '2026-10-05'),
      sessionRow('s2', '2026-10-03'),
      sessionRow('s1', '2026-10-01'),
    ]);
    const page = await service.workouts(access(), { cursor: undefined, limit: 2 }, 7);
    expect(content.listCompleted).toHaveBeenCalledWith(CLIENT, {
      fromLocalDate: WINDOW_START,
      cursor: null,
      take: 3,
    });
    expect(page.items.map((w) => w.id)).toEqual(['s3', 's2']);
    expect(page.nextCursor).toBe(encodeCursor(new Date('2026-10-03T10:00:00Z'), 's2'));
    expect(JSON.stringify(page)).not.toContain('SECRET');
  });

  it('the last page has no cursor; a returned cursor is decoded; a tampered one restarts at the top', async () => {
    const { service, content } = setup();
    content.listCompleted.mockResolvedValue([sessionRow('s1', '2026-10-01')]);
    expect(
      (await service.workouts(access(), { cursor: undefined, limit: 5 }, 7)).nextCursor,
    ).toBeNull();

    const cursor = encodeCursor(new Date('2026-10-03T10:00:00Z'), 's2');
    await service.workouts(access(), { cursor, limit: 5 }, 7);
    expect(content.listCompleted).toHaveBeenLastCalledWith(CLIENT, {
      fromLocalDate: WINDOW_START,
      cursor: { startedAt: new Date('2026-10-03T10:00:00Z'), id: 's2' },
      take: 6,
    });
    await service.workouts(access(), { cursor: 'not-a-cursor!', limit: 5 }, 7);
    expect(content.listCompleted).toHaveBeenLastCalledWith(
      CLIENT,
      expect.objectContaining({ cursor: null }),
    );
  });

  it('the page size is capped at 20', async () => {
    const { service, content } = setup();
    await service.workouts(access(), { cursor: undefined, limit: 500 }, 7);
    expect(content.listCompleted).toHaveBeenCalledWith(
      CLIENT,
      expect.objectContaining({ take: 21 }),
    );
  });

  it('cardio is filtered by the TRAINER’s client level, like Following', async () => {
    const { service, content } = setup();
    content.listCompleted.mockResolvedValue([
      sessionRow('s1', '2026-10-01', 'run', 'DURATION_DISTANCE'),
    ]);
    expect(
      (await service.workouts(access(), { cursor: undefined, limit: 5 }, 2)).items[0]?.exercises,
    ).toEqual([]);
    expect(
      (await service.workouts(access(), { cursor: undefined, limit: 5 }, 3)).items[0]?.exercises,
    ).toHaveLength(1);
  });

  it('needs the link: a note-only access (no link) is the uniform NOT_FOUND', async () => {
    await expect(
      setup().service.workouts(access(null), { cursor: undefined, limit: 5 }, 7),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('overview', () => {
  it('adherence counts only sessions from the window, shares pause DATES only, and plans from the routine', async () => {
    const { service, content } = setup({
      routine: {
        days: [{ plannedWeekday: 0 }, { plannedWeekday: 2 }, { plannedWeekday: null }],
      } as unknown as RoutineWithDays,
    });
    content.listCompleted.mockResolvedValue([sessionRow('s1', '2026-10-06')]);
    const out = await service.overview(access(), '2026-10-07', 7);

    expect(out.client).toEqual({ name: 'Maria Pop', since: '2026-10-07T09:00:00.000Z' });
    expect(content.listCompleted).toHaveBeenCalledWith(CLIENT, {
      fromLocalDate: WINDOW_START,
      cursor: null,
      take: 5,
    });
    expect(out.recent).toHaveLength(1);
    // 1 Sep is before the window: no week before the window is judged, and its session is not counted.
    expect(out.adherence.weeks[0]?.weekStart).toBe('2026-09-07');
    expect(out.adherence.weeks.map((w) => w.sessions).reduce((a, b) => a + b, 0)).toBe(3);
    // The pause shows as dates only; the reason ("injury") never leaves the service.
    expect(out.adherence.days.find((d) => d.localDate === '2026-10-05')).toMatchObject({
      planned: true,
      trained: true,
      paused: true,
    });
    expect(JSON.stringify(out)).not.toMatch(/injury|reason|SECRET/);
  });
});

describe('exerciseHistory', () => {
  it('returns the last exposures inside the window, skipped ones left out', async () => {
    const { service, content } = setup();
    content.listCompletedForExercise.mockResolvedValue([
      sessionRow('s2', '2026-10-05'),
      sessionRow('s1', '2026-10-01', 'squat', 'WEIGHT_REPS', true),
    ]);
    const out = await service.exerciseHistory(access(), 'squat', 7);
    expect(content.listCompletedForExercise).toHaveBeenCalledWith(CLIENT, 'squat', {
      fromLocalDate: WINDOW_START,
      take: COACHING_LIMITS.historyExposures,
    });
    expect(out.name).toBe('Exercise squat');
    expect(out.entries).toEqual([
      {
        localDate: '2026-10-05',
        sets: [{ weightKg: 60, reps: 8, isWarmup: false, completed: true }],
        lastSetRir: 2,
      },
    ]);
  });

  it('an exercise the client cannot see is NOT_FOUND; a type the trainer cannot render is an empty history', async () => {
    const { service, content } = setup();
    await expect(service.exerciseHistory(access(), 'ghost', 7)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(await service.exerciseHistory(access(), 'run', 2)).toMatchObject({ entries: [] });
    expect(content.listCompletedForExercise).not.toHaveBeenCalled();
  });
});

describe('routine and the next-session panel', () => {
  const routine = (): RoutineWithDays =>
    ({
      id: 'r1',
      userId: CLIENT,
      name: 'Plan',
      templateKey: null,
      version: 3,
      nextDayId: 'd1',
      updatedAt: new Date('2026-10-03T00:00:00Z'),
      lastEditedById: null,
      lastEditedAt: null,
      days: [
        {
          id: 'd1',
          position: 0,
          name: 'Day A',
          plannedWeekday: 0,
          exercises: [
            {
              id: 're1',
              exerciseId: 'squat',
              position: 0,
              sets: 3,
              repMin: 6,
              repMax: 8,
              targetRir: 2,
              restSec: 120,
              supersetGroup: null,
              notes: 'SECRET',
              trainerNote: null,
              lastEditedById: null,
              lastEditedAt: null,
            },
            {
              id: 're2',
              exerciseId: 'run',
              position: 1,
              sets: 1,
              repMin: 1,
              repMax: 1,
              targetRir: 0,
              restSec: 60,
              supersetGroup: null,
              notes: null,
              trainerNote: null,
              lastEditedById: null,
              lastEditedAt: null,
            },
          ],
        },
      ],
    }) as unknown as RoutineWithDays;

  it('null when the client has no active routine', async () => {
    expect(await setup().service.routine(access(), '2026-10-07')).toBeNull();
  });

  it('strength rows get the panel: the suggestion with who set the pending target; cardio rows none', async () => {
    const { service, progression } = setup({
      routine: routine(),
      progress: [
        {
          exerciseId: 'squat',
          repBucket: '6-8',
          suggestion: suggestion(60),
          lastExposureDate: '2026-10-01',
          override: {
            weightKg: 62.5,
            reps: [6, 6, 6, 6],
            at: '2026-10-05T10:00:00.000Z',
            setById: TRAINER,
          },
        },
      ],
    });
    const dto = await service.routine(access(), '2026-10-07');
    expect(progression.forCoach).toHaveBeenCalledWith(CLIENT, ['squat', 'run'], '2026-10-07');
    expect(dto?.days[0]?.exercises[0]?.next).toEqual({
      repBucket: '6-8',
      suggestion: suggestion(60),
      override: {
        weightKg: 62.5,
        reps: [6, 6, 6, 6],
        at: '2026-10-05T10:00:00.000Z',
        setBy: 'TRAINER',
      },
      lastDoneDate: '2026-10-01',
    });
    expect(dto?.days[0]?.exercises[1]?.next).toBeNull();
    expect(JSON.stringify(dto)).not.toContain('SECRET');
  });

  it('a target the CLIENT set (or an old row with no setter) reads setBy CLIENT', async () => {
    for (const setById of [CLIENT, undefined]) {
      const { service } = setup({
        routine: routine(),
        progress: [
          {
            exerciseId: 'squat',
            repBucket: '6-8',
            suggestion: suggestion(),
            lastExposureDate: null,
            override: {
              weightKg: 55,
              reps: [8],
              at: '2026-10-05T10:00:00.000Z',
              ...(setById && { setById }),
            },
          },
        ],
      });
      const dto = await service.routine(access(), '2026-10-07');
      expect(dto?.days[0]?.exercises[0]?.next?.override?.setBy).toBe('CLIENT');
    }
  });

  it('nextTarget: the panel data for one bucket; an unknown bucket is NOT_FOUND', async () => {
    const { service } = setup({
      progress: [
        {
          exerciseId: 'squat',
          repBucket: '6-8',
          suggestion: suggestion(),
          lastExposureDate: null,
          override: null,
        },
      ],
    });
    expect(await service.nextTarget(CLIENT, 'squat', '6-8', '2026-10-07')).toMatchObject({
      repBucket: '6-8',
      override: null,
    });
    await expect(service.nextTarget(CLIENT, 'squat', '1-2', '2026-10-07')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
