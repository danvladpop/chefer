import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ExerciseProgression,
  IExerciseProgressionRepository,
  IExerciseRepository,
  IGymProfileRepository,
  IWorkoutSessionRepository,
} from '@chefer/database';
import { COACHING_API_LEVEL } from '@chefer/types';
import { exerciseRow, profileRow, progressionState, routineRow } from './__test__/fixtures.js';
import type { GymUserContext } from './gym-context.js';
import { toEquipmentProfile, toRoutineDto } from './mappers.js';
import { ProgressionService, toOverrideDto } from './progression.service.js';

// Trainer coaching on the progression side (spec §5.2, §6.2, §9.2): who set the
// next-session target (`setById`), what a client sees of it by API level, and the
// trainer's own read (`forCoach`).

// progression.service.ts → lib/env.ts (via the gym services' flags); the engine is real here.
vi.mock('../../lib/env.js', () => ({ env: {} }));
vi.mock('../../lib/flags.js', () => ({ isFlagEnabled: () => false }));

const USER = 'u1';
const TRAINER = 'ctrainer0000000000000001';

function ctx(): GymUserContext {
  const profile = profileRow();
  return {
    profileRow: profile,
    equipment: toEquipmentProfile(profile),
    experience: 'BEGINNER',
    facts: { experience: 'BEGINNER', ageYears: null },
    offerState: {},
    activeRoutine: toRoutineDto(routineRow()),
  };
}

function row(over: Partial<ExerciseProgression> = {}): ExerciseProgression {
  return {
    userId: USER,
    exerciseId: 'bench',
    repBucket: '6-10',
    state: { ...progressionState({ lastExposureDate: null }) },
    override: null,
    overrideAt: null,
    engineVersion: 1,
    updatedAt: new Date(),
    ...over,
  } as ExerciseProgression;
}

function setup(rows: ExerciseProgression[] = [row()]) {
  const progressionRepo: IExerciseProgressionRepository = {
    findForUser: vi.fn().mockResolvedValue(rows),
    find: vi.fn().mockResolvedValue(rows[0] ?? null),
    upsertStates: vi.fn().mockResolvedValue(undefined),
    setOverride: vi.fn().mockResolvedValue(row()),
  };
  const exerciseRepo = {
    findVisibleByIds: vi.fn((_u: string, ids: string[]) =>
      Promise.resolve(ids.map((id) => exerciseRow(id))),
    ),
  } as unknown as IExerciseRepository;
  const attribution = {
    names: vi.fn(
      async (ids: readonly string[]) => new Map(ids.includes(TRAINER) ? [[TRAINER, 'Ana']] : []),
    ),
  };
  const service = new ProgressionService(
    progressionRepo,
    {} as unknown as IWorkoutSessionRepository,
    exerciseRepo,
    { update: vi.fn() } as unknown as IGymProfileRepository,
    { load: vi.fn().mockResolvedValue(ctx()) },
    attribution,
  );
  return { service, progressionRepo, attribution };
}

const override = (over: object = {}) => ({
  weightKg: 62.5,
  reps: [6, 6, 6, 6],
  at: '2026-10-05T10:00:00.000Z',
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('setOverride: who set it', () => {
  it('stamps the owner by default (gym.progression.setOverride) and the trainer when told', async () => {
    const { service, progressionRepo } = setup();
    await service.setOverride(USER, {
      exerciseId: 'bench',
      repBucket: '6-10',
      weightKg: 60,
      reps: [8],
    });
    expect(vi.mocked(progressionRepo.setOverride).mock.calls[0]?.[3]).toMatchObject({
      setById: USER,
    });

    await service.setOverride(
      USER,
      { exerciseId: 'bench', repBucket: '6-10', weightKg: 62.5, reps: [6, 6, 6, 6] },
      { setById: TRAINER },
    );
    expect(vi.mocked(progressionRepo.setOverride).mock.calls[1]?.[3]).toMatchObject({
      weightKg: 62.5,
      reps: [6, 6, 6, 6],
      setById: TRAINER,
    });
  });
});

describe('toOverrideDto: never the setter id, a name at level 6', () => {
  it('null stays null; an owner-set target (or an old row with no setter) has no name', () => {
    expect(toOverrideDto(null, USER, new Map())).toBeNull();
    expect(toOverrideDto(override({ setById: USER }), USER, new Map([[USER, 'Me']]))).toEqual(
      override(),
    );
    expect(toOverrideDto(override(), USER, new Map())).toEqual(override());
  });

  it('a trainer-set target carries setByName when names were resolved, and never setById', () => {
    const dto = toOverrideDto(override({ setById: TRAINER }), USER, new Map([[TRAINER, 'Ana']]));
    expect(dto).toEqual({ ...override(), setByName: 'Ana' });
    expect(dto).not.toHaveProperty('setById');
    // Below level 6 no names are resolved: the legacy shape, the target still applies.
    expect(toOverrideDto(override({ setById: TRAINER }), USER, undefined)).toEqual(override());
    expect(
      JSON.stringify(toOverrideDto(override({ setById: TRAINER }), USER, undefined)),
    ).not.toContain(TRAINER);
  });

  it('a setter whose account is gone reads "your trainer"', () => {
    expect(toOverrideDto(override({ setById: 'cgone' }), USER, new Map())).toMatchObject({
      setByName: 'your trainer',
    });
  });
});

describe('levels', () => {
  it('forExercises below level 6 queries no names and sends the legacy override', async () => {
    const { service, attribution } = setup([
      row({ override: override({ setById: TRAINER }) as never }),
    ]);
    const [dto] = await service.forExercises(USER, ['bench'], '2026-10-06', COACHING_API_LEVEL - 1);
    expect(attribution.names).not.toHaveBeenCalled();
    expect(dto?.override).toEqual(override());
    expect(dto?.suggestion).toMatchObject({ reasonCode: 'USER_OVERRIDE' });
  });

  it('forExercises at level 6 names the trainer', async () => {
    const { service, attribution } = setup([
      row({ override: override({ setById: TRAINER }) as never }),
    ]);
    const [dto] = await service.forExercises(USER, ['bench'], '2026-10-06', COACHING_API_LEVEL);
    expect(attribution.names).toHaveBeenCalledWith([TRAINER]);
    expect(dto?.override).toEqual({ ...override(), setByName: 'Ana' });
  });

  it('setterNames asks only about targets someone other than the owner set', async () => {
    const { service, attribution } = setup();
    const rows = [
      row({ override: override({ setById: USER }) as never }),
      row({ exerciseId: 'squat', override: override() as never }),
      row({ exerciseId: 'row', override: override({ setById: TRAINER }) as never }),
      row({ exerciseId: 'ohp', override: null }),
    ];
    await service.setterNames(rows, 6);
    expect(attribution.names).toHaveBeenCalledWith([TRAINER]);
    expect(await service.setterNames(rows, 5)).toBeUndefined();
  });
});

describe('forCoach (the trainer’s next-session panel)', () => {
  it('returns the engine’s own suggestion (no target applied) next to the pending target and who set it', async () => {
    const { service } = setup([row({ override: override({ setById: TRAINER }) as never })]);
    const [p] = await service.forCoach(USER, ['bench'], '2026-10-06');
    expect(p?.suggestion.reasonCode).not.toBe('USER_OVERRIDE');
    expect(p?.override).toMatchObject({ weightKg: 62.5, setById: TRAINER });
    expect(p?.repBucket).toBe('6-10');
  });

  it('a target older than the last exposure was consumed: no longer pending', async () => {
    const { service } = setup([
      row({
        state: { ...progressionState({ lastExposureDate: '2026-10-06' }) } as never,
        override: override({ at: '2026-10-05T10:00:00.000Z', setById: TRAINER }) as never,
      }),
    ]);
    const [p] = await service.forCoach(USER, ['bench'], '2026-10-07');
    expect(p?.override).toBeNull();
    expect(p?.lastExposureDate).toBe('2026-10-06');
  });

  it('an exercise with no stored progression gets a starting state for its routine bucket', async () => {
    const { service } = setup([]);
    const out = await service.forCoach(USER, ['bench'], '2026-10-06');
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((p) => p.override === null && p.lastExposureDate === null)).toBe(true);
  });

  it('no ids, no queries', async () => {
    const { service, progressionRepo } = setup();
    expect(await service.forCoach(USER, [], '2026-10-06')).toEqual([]);
    expect(progressionRepo.findForUser).not.toHaveBeenCalled();
  });
});
