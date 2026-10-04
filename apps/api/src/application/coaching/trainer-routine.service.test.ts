import { TRPCError } from '@trpc/server';
import { describe, expect, it, vi } from 'vitest';
import type { CoachingLink, Exercise, RoutineWithDays } from '@chefer/database';
import { COACHING_COPY, type RoutineDto, type TrainerRoutineDto } from '@chefer/types';
import { ConflictCause } from '../../lib/conflict.js';
import type { CoachingAccess } from './coaching-access.service.js';
import { TrainerRoutineService, type SaveTrainerRoutineInput } from './trainer-routine.service.js';

// The trainer's writes (spec §5.3, §6, §9): curated-only exercises, the TRAINER
// path of replaceDocument (never the client's own notes), version conflicts,
// next-session targets stamped with setById.

// trainer-routine.service.ts → gym services → lib/env.ts (throws without secrets).
vi.mock('../../lib/env.js', () => ({ env: {} }));

const TRAINER = 'ctrainer0000000000000001';
const CLIENT = 'cclient00000000000000001';
const LINK = { id: 'l1', startedAt: new Date('2026-10-01T00:00:00Z') } as CoachingLink;
const access: CoachingAccess = { trainerId: TRAINER, clientId: CLIENT, scope: 'write', link: LINK };

const exercise = (id: string, over: Partial<Exercise> = {}): Exercise =>
  ({
    id,
    name: id,
    ownerId: null,
    trackingType: 'WEIGHT_REPS',
    loadType: 'WEIGHTED',
    isTimed: false,
    ...over,
  }) as unknown as Exercise;

const storedRow = (id: string, exerciseId: string, over: object = {}) => ({
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
  notes: 'client note',
  trainerNote: null,
  lastEditedById: null,
  lastEditedAt: null,
  ...over,
});

function stored(): RoutineWithDays {
  return {
    id: 'r1',
    userId: CLIENT,
    name: 'Plan',
    version: 4,
    isActive: true,
    days: [
      {
        id: 'd1',
        routineId: 'r1',
        position: 0,
        name: 'Day A',
        plannedWeekday: 0,
        exercises: [storedRow('re1', 'squat'), storedRow('re2', 'custom-mine', { position: 1 })],
      },
    ],
  } as unknown as RoutineWithDays;
}

const docRow = (over: object = {}) => ({
  id: 're1',
  exerciseId: 'squat',
  sets: 3,
  repMin: 6,
  repMax: 8,
  targetRir: 2,
  restSec: 120,
  supersetGroup: null,
  trainerNote: null as string | null,
  ...over,
});
function doc(
  rows: object[] = [docRow(), docRow({ id: 're2', exerciseId: 'custom-mine' })],
): SaveTrainerRoutineInput['routine'] {
  return {
    id: 'r1',
    name: ' Plan ',
    days: [{ id: 'd1', name: ' Day A ', plannedWeekday: 0, exercises: rows as never }],
  };
}

const trainerDto = { id: 'r1', version: 5 } as unknown as TrainerRoutineDto;

function setup(
  opts: { active?: RoutineWithDays | null; exercises?: Exercise[]; gymEquipment?: string } = {},
) {
  const routines = {
    findActive: vi.fn(async () => (opts.active === undefined ? stored() : opts.active)),
    replaceDocument: vi.fn(
      async (..._args: unknown[]) => ({ status: 'ok', routine: stored() }) as const,
    ),
    create: vi.fn(async (..._args: unknown[]) => stored()),
  };
  const content = {
    routineDto: vi.fn(async () => trainerDto),
    conflictDto: vi.fn(async () => ({ id: 'r1', version: 9 }) as unknown as RoutineDto),
    nextTarget: vi.fn(async () => ({ repBucket: '6-8' }) as never),
  };
  const progression = {
    setOverride: vi.fn(async () => ({}) as never),
    clearOverride: vi.fn(async () => ({}) as never),
  };
  const exercises = {
    findVisibleByIds: vi.fn(async (_u: string, ids: string[]) =>
      (
        opts.exercises ?? [
          exercise('squat'),
          exercise('bench'),
          exercise('custom-mine', { ownerId: CLIENT }),
          exercise('run', { trackingType: 'DURATION_DISTANCE' } as never),
        ]
      ).filter((e) => ids.includes(e.id)),
    ),
  };
  const service = new TrainerRoutineService({
    routines,
    exercises,
    gymProfiles: { findByUserId: vi.fn(async () => ({ equipmentAccess: 'FULL_GYM' }) as never) },
    content,
    progression,
    ensureLibrary: vi.fn(async () => undefined),
    now: () => new Date('2026-10-07T12:00:00Z'),
  });
  return { service, routines, content, progression, exercises };
}

describe('saveRoutine', () => {
  it('saves on the TRAINER path with the diff, normalised names and the stored version check', async () => {
    const { service, routines } = setup();
    const out = await service.saveRoutine(access, {
      clientId: CLIENT,
      routine: doc([
        docRow({ trainerNote: '  knees out  ' }),
        docRow({ id: 're2', exerciseId: 'custom-mine' }),
      ]),
      expectedVersion: 4,
    });
    expect(out).toBe(trainerDto);
    expect(routines.replaceDocument).toHaveBeenCalledTimes(1);
    const [owner, routineId, written, version, actor] = routines.replaceDocument.mock
      .calls[0] as unknown as [
      string,
      string,
      {
        name: string;
        days: {
          name: string;
          exercises: { id: string; notes: string | null; trainerNote: string | null }[];
        }[];
      },
      number,
      { actorId: string; path: string; diff: unknown },
    ];
    expect([owner, routineId, version]).toEqual([CLIENT, 'r1', 4]);
    expect(actor).toMatchObject({ actorId: TRAINER, path: 'TRAINER' });
    expect(typeof actor.diff).toBe('function');
    expect(written.name).toBe('Plan');
    expect(written.days[0]?.name).toBe('Day A');
    // The trainer note is trimmed; the client's own `notes` is never part of the write (null, never the stored text).
    expect(written.days[0]?.exercises.map((e) => [e.id, e.trainerNote, e.notes])).toEqual([
      ['re1', 'knees out', null],
      ['re2', null, null],
    ]);
  });

  it('a blank trainer note is no note', async () => {
    const { service, routines } = setup();
    await service.saveRoutine(access, {
      clientId: CLIENT,
      routine: doc([
        docRow({ trainerNote: '   ' }),
        docRow({ id: 're2', exerciseId: 'custom-mine' }),
      ]),
      expectedVersion: 4,
    });
    const written = routines.replaceDocument.mock.calls[0]?.[2] as {
      days: { exercises: { trainerNote: string | null }[] }[];
    };
    expect(written.days[0]?.exercises[0]?.trainerNote).toBeNull();
  });

  it('normalises superset letters before writing', async () => {
    const { service, routines } = setup();
    await service.saveRoutine(access, {
      clientId: CLIENT,
      routine: doc([
        docRow({ supersetGroup: 'Q' }),
        docRow({ id: 're2', exerciseId: 'custom-mine', supersetGroup: 'Q' }),
        docRow({ id: undefined, exerciseId: 'bench', supersetGroup: 'Z' }),
      ]),
      expectedVersion: 4,
    });
    const written = routines.replaceDocument.mock.calls[0]?.[2] as {
      days: { exercises: { supersetGroup: string | null }[] }[];
    };
    expect(written.days[0]?.exercises.map((e) => e.supersetGroup)).toEqual(['A', 'A', null]);
  });

  it('adds only curated exercises: a custom exercise (of anyone) that is not already in the routine is refused', async () => {
    const { service, routines } = setup({
      exercises: [
        exercise('squat'),
        exercise('custom-mine', { ownerId: CLIENT }),
        exercise('custom-new', { ownerId: CLIENT }),
      ],
    });
    await expect(
      service.saveRoutine(access, {
        clientId: CLIENT,
        routine: doc([
          docRow(),
          docRow({ id: 're2', exerciseId: 'custom-mine' }),
          docRow({ id: undefined, exerciseId: 'custom-new' }),
        ]),
        expectedVersion: 4,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(routines.replaceDocument).not.toHaveBeenCalled();
  });

  it('a custom exercise already in the routine stays, but cannot be added a second time', async () => {
    const { service } = setup();
    await expect(
      service.saveRoutine(access, {
        clientId: CLIENT,
        routine: doc([
          docRow(),
          docRow({ id: 're2', exerciseId: 'custom-mine' }),
          docRow({ id: undefined, exerciseId: 'custom-mine' }),
        ]),
        expectedVersion: 4,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('an unknown exercise id is BAD_REQUEST', async () => {
    const { service } = setup();
    await expect(
      service.saveRoutine(access, {
        clientId: CLIENT,
        routine: doc([docRow({ exerciseId: 'ghost' })]),
        expectedVersion: 4,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: 'Unknown exercise: ghost' });
  });

  it('only the ACTIVE routine can be edited: a different id is PRECONDITION_FAILED, no routine is NOT_FOUND', async () => {
    const other = { ...doc(), id: 'r2' };
    await expect(
      setup().service.saveRoutine(access, { clientId: CLIENT, routine: other, expectedVersion: 4 }),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    await expect(
      setup({ active: null }).service.saveRoutine(access, {
        clientId: CLIENT,
        routine: doc(),
        expectedVersion: 4,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('a stale version is CONFLICT with { kind: routine, current } built for the trainer', async () => {
    const { service, routines, content } = setup();
    routines.replaceDocument.mockResolvedValueOnce({
      status: 'conflict',
      current: stored(),
    } as never);
    const err = await service
      .saveRoutine(access, { clientId: CLIENT, routine: doc(), expectedVersion: 1 })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TRPCError);
    expect(err).toMatchObject({ code: 'CONFLICT' });
    const cause = (err as TRPCError).cause;
    expect(cause).toBeInstanceOf(ConflictCause);
    expect((cause as ConflictCause).payload).toEqual({
      kind: 'routine',
      current: { id: 'r1', version: 9 },
    });
    expect(content.conflictDto).toHaveBeenCalledWith(expect.anything(), TRAINER);
  });

  it('a routine that vanished mid-save is NOT_FOUND', async () => {
    const { service, routines } = setup();
    routines.replaceDocument.mockResolvedValueOnce({ status: 'not_found' } as never);
    await expect(
      service.saveRoutine(access, { clientId: CLIENT, routine: doc(), expectedVersion: 4 }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('a save without a link is the uniform NOT_FOUND', async () => {
    await expect(
      setup().service.saveRoutine(
        { ...access, link: null },
        { clientId: CLIENT, routine: doc(), expectedVersion: 4 },
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', message: COACHING_COPY.server.clientUnavailable });
  });
});

describe('createRoutine', () => {
  it('only when the client has no active routine', async () => {
    const { service, routines } = setup();
    await expect(
      service.createRoutine(access, { clientId: CLIENT, days: 2 }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    expect(routines.create).not.toHaveBeenCalled();
  });

  it('creates a blank active routine stamped as created by the trainer (default 3 days)', async () => {
    const { service, routines } = setup({ active: null });
    await service.createRoutine(access, {
      clientId: CLIENT,
      days: undefined,
      templateKey: undefined,
    });
    expect(routines.create).toHaveBeenCalledWith(CLIENT, {
      name: 'Training plan',
      templateKey: null,
      isActive: true,
      editedBy: { id: TRAINER, at: new Date('2026-10-07T12:00:00Z') },
      days: [1, 2, 3].map((n) => ({ name: `Day ${n}`, plannedWeekday: null, exercises: [] })),
    });
  });

  it('a template is instantiated for the client’s equipment', async () => {
    const { service, routines } = setup({ active: null });
    await service.createRoutine(access, { clientId: CLIENT, templateKey: 'fb2-beginner' });
    const data = routines.create.mock.calls[0]?.[1] as {
      templateKey: string;
      isActive: boolean;
      days: unknown[];
    };
    expect(data).toMatchObject({ templateKey: 'fb2-beginner', isActive: true });
    expect(data.days.length).toBeGreaterThan(0);
  });
});

describe('next-session targets', () => {
  const target = {
    clientId: CLIENT,
    exerciseId: 'squat',
    repBucket: '6-8',
    weightKg: 62.5,
    reps: [6, 6, 6, 6],
  };

  it('sets the D5c override on the CLIENT’s progression, stamped with the trainer', async () => {
    const { service, progression, content } = setup();
    await service.setNextTarget(access, target);
    expect(progression.setOverride).toHaveBeenCalledWith(
      CLIENT,
      { exerciseId: 'squat', repBucket: '6-8', weightKg: 62.5, reps: [6, 6, 6, 6] },
      { setById: TRAINER },
    );
    expect(content.nextTarget).toHaveBeenCalledWith(CLIENT, 'squat', '6-8');
  });

  it.each([
    ['an exercise that is not in the routine', { exerciseId: 'bench' }],
    ['a rep bucket no row of that exercise uses', { repBucket: '1-2' }],
    ['a cardio exercise', { exerciseId: 'run' }],
  ])('refuses %s', async (_n, over) => {
    const { service, progression } = setup({
      active: {
        ...stored(),
        days: [
          {
            ...stored().days[0],
            exercises: [
              ...(stored().days[0]?.exercises ?? []),
              storedRow('re3', 'run', { repMin: 6, repMax: 8 }),
              storedRow('re4', 'bench', { repMin: 8, repMax: 10 }),
            ].slice(0, 3),
          },
        ],
      } as never,
    });
    await expect(service.setNextTarget(access, { ...target, ...over })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    expect(progression.setOverride).not.toHaveBeenCalled();
  });

  it('clearing resets to the app suggestion; with nothing stored it is not an error', async () => {
    const { service, progression } = setup();
    await service.clearNextTarget(access, {
      clientId: CLIENT,
      exerciseId: 'squat',
      repBucket: '6-8',
    });
    expect(progression.clearOverride).toHaveBeenCalledWith(CLIENT, {
      exerciseId: 'squat',
      repBucket: '6-8',
    });
    progression.clearOverride.mockRejectedValueOnce(
      new TRPCError({ code: 'NOT_FOUND', message: 'No progression' }),
    );
    await expect(
      service.clearNextTarget(access, { clientId: CLIENT, exerciseId: 'squat', repBucket: '6-8' }),
    ).resolves.toBeDefined();
    progression.clearOverride.mockRejectedValueOnce(new Error('db down'));
    await expect(
      service.clearNextTarget(access, { clientId: CLIENT, exerciseId: 'squat', repBucket: '6-8' }),
    ).rejects.toThrow('db down');
  });
});
