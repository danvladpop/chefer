import { TRPCError } from '@trpc/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  IExerciseRepository,
  IGymProfileRepository,
  IRoutineRepository,
} from '@chefer/database';
import type { RoutineDoc } from '@chefer/types';
import { instantiateTemplate } from '@chefer/utils';
import { ConflictCause } from '../../lib/conflict.js';
import { exerciseRow, routineRow } from './__test__/fixtures.js';
import { RoutineService } from './routine.service.js';

vi.mock('@chefer/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@chefer/utils')>()),
  instantiateTemplate: vi.fn(),
}));

const USER = 'u1';

function doc(over: Partial<RoutineDoc> = {}): RoutineDoc {
  return {
    id: 'r1',
    name: 'Upper/Lower',
    days: [
      {
        id: 'day-a',
        name: 'Day A',
        plannedWeekday: 0,
        exercises: [
          {
            id: 're-bench',
            exerciseId: 'bench',
            sets: 4,
            repMin: 6,
            repMax: 10,
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

function setup() {
  const repo = {
    listForUser: vi.fn().mockResolvedValue([]),
    findByIdForUser: vi.fn().mockResolvedValue(routineRow()),
    findActive: vi.fn(),
    create: vi.fn((_u: string, data: { name: string; isActive: boolean }) =>
      Promise.resolve(routineRow({ name: data.name, isActive: data.isActive })),
    ),
    replaceDocument: vi.fn(),
    setActive: vi.fn(),
    archive: vi.fn(),
    setNextDay: vi.fn(),
  } satisfies IRoutineRepository;
  const exerciseRepo = {
    findVisibleByIds: vi.fn((_u: string, ids: string[]) =>
      Promise.resolve(ids.filter((id) => id !== 'ghost').map((id) => exerciseRow(id))),
    ),
  } as unknown as IExerciseRepository;
  const profileRepo = {
    findByUserId: vi.fn().mockResolvedValue(null),
  } as unknown as IGymProfileRepository;
  const ensure = vi.fn().mockResolvedValue(undefined);
  return {
    service: new RoutineService(repo, exerciseRepo, profileRepo, ensure),
    repo,
    ensure,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('RoutineService.save', () => {
  it('replaces the document when the version matches', async () => {
    const { service, repo } = setup();
    repo.replaceDocument.mockResolvedValue({ status: 'ok', routine: routineRow({ version: 2 }) });

    const saved = await service.save(USER, doc(), 1);

    expect(saved.version).toBe(2);
    expect(repo.replaceDocument).toHaveBeenCalledWith(
      USER,
      'r1',
      expect.objectContaining({ name: 'Upper/Lower' }),
      1,
    );
  });

  it('a stale version throws CONFLICT carrying the current RoutineDto', async () => {
    const { service, repo } = setup();
    repo.replaceDocument.mockResolvedValue({
      status: 'conflict',
      current: routineRow({ version: 5, name: 'Edited on the web' }),
    });

    const err = await service.save(USER, doc(), 3).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(TRPCError);
    expect((err as TRPCError).code).toBe('CONFLICT');
    const cause = (err as TRPCError).cause;
    expect(cause).toBeInstanceOf(ConflictCause);
    expect((cause as ConflictCause).payload).toMatchObject({
      kind: 'routine',
      current: { id: 'r1', version: 5, name: 'Edited on the web' },
    });
  });

  it("someone else's (or a missing) routine is NOT_FOUND", async () => {
    const { service, repo } = setup();
    repo.replaceDocument.mockResolvedValue({ status: 'not_found' });
    await expect(service.save(USER, doc(), 1)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rejects exercises the user cannot see before writing', async () => {
    const { service, repo } = setup();
    const bad = doc();
    bad.days[0]!.exercises[0]!.exerciseId = 'ghost';

    await expect(service.save(USER, bad, 1)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(repo.replaceDocument).not.toHaveBeenCalled();
  });
});

describe('RoutineService other operations', () => {
  it('createFromTemplate instantiates via the engine with the profile equipment', async () => {
    const { service, repo, ensure } = setup();
    vi.mocked(instantiateTemplate).mockReturnValue({
      name: 'Full Body 2×',
      templateKey: 'fb2-beginner',
      weeklyGoal: 2,
      days: [{ name: 'A', plannedWeekday: 0, exercises: [] }],
    });

    await service.createFromTemplate(USER, 'fb2-beginner', true);

    expect(ensure).toHaveBeenCalled();
    expect(instantiateTemplate).toHaveBeenCalledWith(
      'fb2-beginner',
      'FULL_GYM',
      expect.any(Function),
    );
    expect(repo.create).toHaveBeenCalledWith(USER, {
      name: 'Full Body 2×',
      templateKey: 'fb2-beginner',
      isActive: true,
      days: [{ name: 'A', plannedWeekday: 0, exercises: [] }],
    });
  });

  it('createFromTemplate rejects unknown keys', async () => {
    const { service } = setup();
    await expect(service.createFromTemplate(USER, 'nope', false)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('createBlank makes N empty days, inactive', async () => {
    const { service, repo } = setup();
    await service.createBlank(USER, '  My split ', 3);
    expect(repo.create).toHaveBeenCalledWith(USER, {
      name: 'My split',
      templateKey: null,
      isActive: false,
      days: [
        { name: 'Day 1', plannedWeekday: null, exercises: [] },
        { name: 'Day 2', plannedWeekday: null, exercises: [] },
        { name: 'Day 3', plannedWeekday: null, exercises: [] },
      ],
    });
  });

  it('setNextDay on a day outside the routine is NOT_FOUND', async () => {
    const { service, repo } = setup();
    repo.setNextDay.mockResolvedValue(null);
    await expect(service.setNextDay(USER, 'r1', 'other')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('templates lists every program template', () => {
    const { service } = setup();
    expect(service.templates().length).toBeGreaterThanOrEqual(8);
  });
});
