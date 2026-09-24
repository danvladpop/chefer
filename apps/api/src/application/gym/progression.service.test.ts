import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ExerciseProgression,
  IExerciseProgressionRepository,
  IExerciseRepository,
  IGymProfileRepository,
  IWorkoutSessionRepository,
} from '@chefer/database';
import type { Exposure } from '@chefer/types';
import { exposuresFromSession, foldHistory, prescribe } from '@chefer/utils';
import {
  exerciseRow,
  profileRow,
  progressionState,
  routineRow,
  sessionDoc,
  sessionRow,
  suggestion,
} from './__test__/fixtures.js';
import type { GymUserContext } from './gym-context.js';
import { toEquipmentProfile, toRoutineDto } from './mappers.js';
import { ProgressionService } from './progression.service.js';

vi.mock('@chefer/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@chefer/utils')>()),
  exposuresFromSession: vi.fn(),
  foldHistory: vi.fn(),
  prescribe: vi.fn(),
  addDaysLocal: vi.fn((d: string, n: number) => {
    const t = new Date(`${d}T00:00:00Z`);
    t.setUTCDate(t.getUTCDate() + n);
    return t.toISOString().slice(0, 10);
  }),
}));

const USER = 'u1';

function exposure(over: Partial<Exposure> = {}): Exposure {
  return {
    sessionId: 's',
    localDate: '2026-09-02',
    performedAt: '2026-09-02T17:00:00.000Z',
    sets: 3,
    repMin: 6,
    repMax: 10,
    targetRir: 2,
    loggedSets: [],
    lastSetRir: null,
    wasDeload: false,
    skipped: false,
    ...over,
  };
}

function ctx(over: Partial<GymUserContext> = {}): GymUserContext {
  const profile = profileRow();
  return {
    profileRow: profile,
    equipment: toEquipmentProfile(profile),
    experience: 'BEGINNER',
    facts: { experience: 'BEGINNER', ageYears: null },
    offerState: {},
    activeRoutine: toRoutineDto(routineRow()),
    ...over,
  };
}

function progRow(over: Partial<ExerciseProgression> = {}): ExerciseProgression {
  return {
    userId: USER,
    exerciseId: 'bench',
    repBucket: '6-10',
    state: { ...progressionState() },
    override: null,
    overrideAt: null,
    engineVersion: 1,
    updatedAt: new Date(),
    ...over,
  } as ExerciseProgression;
}

function setup(opts: { existing?: ExerciseProgression[]; context?: GymUserContext } = {}) {
  const progressionRepo: IExerciseProgressionRepository = {
    findForUser: vi.fn().mockResolvedValue(opts.existing ?? []),
    find: vi.fn().mockResolvedValue(null),
    upsertStates: vi.fn().mockResolvedValue(undefined),
    setOverride: vi.fn().mockResolvedValue(progRow()),
  };
  const sessionRepo = {
    findCompleted: vi.fn().mockResolvedValue([sessionRow(sessionDoc()), sessionRow(sessionDoc())]),
  } as unknown as IWorkoutSessionRepository;
  const exerciseRepo = {
    findVisibleByIds: vi.fn((_u: string, ids: string[]) =>
      Promise.resolve(ids.map((id) => exerciseRow(id))),
    ),
  } as unknown as IExerciseRepository;
  const profileRepo = {
    update: vi.fn().mockResolvedValue(profileRow()),
  } as unknown as IGymProfileRepository;
  const loader = { load: vi.fn().mockResolvedValue(opts.context ?? ctx()) };
  const service = new ProgressionService(
    progressionRepo,
    sessionRepo,
    exerciseRepo,
    profileRepo,
    loader,
  );
  return { service, progressionRepo, sessionRepo, profileRepo };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(foldHistory).mockImplementation(({ exposures }) =>
    progressionState({ lastTotalReps: exposures.length }),
  );
  vi.mocked(prescribe).mockReturnValue(suggestion({ reasonCode: 'ADD_REPS' }));
});

describe('ProgressionService.recompute', () => {
  it('folds every completed exposure per (exercise, rep bucket) and persists the state', async () => {
    // Two sessions: bench in 6-10 both times, squat in a different bucket once.
    vi.mocked(exposuresFromSession)
      .mockReturnValueOnce([
        { exerciseId: 'bench', exposure: exposure({ performedAt: '2026-09-02T17:00:00.000Z' }) },
        { exerciseId: 'squat', exposure: exposure({ repMin: 8, repMax: 12 }) },
      ])
      .mockReturnValueOnce([
        { exerciseId: 'bench', exposure: exposure({ performedAt: '2026-09-05T17:00:00.000Z' }) },
      ]);
    const { service, progressionRepo, sessionRepo } = setup();

    await service.recompute(USER, ['bench', 'squat', 'bench']);

    expect(sessionRepo.findCompleted).toHaveBeenCalledWith(USER, {
      exerciseIds: ['bench', 'squat'],
    });
    expect(foldHistory).toHaveBeenCalledTimes(2);
    const benchCall = vi
      .mocked(foldHistory)
      .mock.calls.find((c) => c[0].slot.exercise.id === 'bench')?.[0];
    expect(benchCall?.exposures).toHaveLength(2);
    // Routine slot is used for the bucket it matches.
    expect(benchCall?.slot).toMatchObject({ sets: 3, repMin: 6, repMax: 10, restSec: 180 });

    const writes = vi.mocked(progressionRepo.upsertStates).mock.calls[0]?.[1];
    expect(writes?.map((w) => `${w.exerciseId}|${w.repBucket}`).sort()).toEqual([
      'bench|6-10',
      'squat|8-12',
    ]);
    expect(writes?.every((w) => w.engineVersion === 1)).toBe(true);
  });

  it('re-folds a bucket that lost all exposures (deleted session) back to its start', async () => {
    vi.mocked(exposuresFromSession).mockReturnValue([]);
    const { service, progressionRepo } = setup({ existing: [progRow()] });

    await service.recompute(USER, ['bench']);

    expect(vi.mocked(foldHistory).mock.calls[0]?.[0].exposures).toEqual([]);
    expect(vi.mocked(progressionRepo.upsertStates).mock.calls[0]?.[1]).toHaveLength(1);
  });

  it('passes the setup "known weight" so a history-less fold keeps the seeded start', async () => {
    vi.mocked(exposuresFromSession).mockReturnValue([]);
    const { service } = setup({
      existing: [progRow()],
      context: ctx({ offerState: { knownWeightsKg: { bench: 70 } } }),
    });

    await service.recompute(USER, ['bench']);

    expect(vi.mocked(foldHistory).mock.calls[0]?.[0].knownWeightKg).toBe(70);
  });

  it('clears an override once an exposure newer than it was logged (applies once)', async () => {
    vi.mocked(exposuresFromSession).mockReturnValue([
      { exerciseId: 'bench', exposure: exposure({ performedAt: '2026-09-05T17:00:00.000Z' }) },
    ]);
    const consumed = progRow({
      override: { weightKg: 65, reps: [8, 8, 8], at: '2026-09-04T09:00:00.000Z' },
    });
    const { service, progressionRepo } = setup({ existing: [consumed] });

    await service.recompute(USER, ['bench']);

    expect(progressionRepo.setOverride).toHaveBeenCalledWith(USER, 'bench', '6-10', null);
  });

  it('keeps an override that no exposure has consumed yet', async () => {
    vi.mocked(exposuresFromSession).mockReturnValue([
      { exerciseId: 'bench', exposure: exposure({ performedAt: '2026-09-02T17:00:00.000Z' }) },
    ]);
    const pending = progRow({
      override: { weightKg: 65, reps: [8, 8, 8], at: '2026-09-04T09:00:00.000Z' },
    });
    const { service, progressionRepo } = setup({ existing: [pending] });

    await service.recompute(USER, ['bench']);

    expect(progressionRepo.setOverride).not.toHaveBeenCalled();
  });

  it('is a no-op for an empty id list', async () => {
    const { service, progressionRepo } = setup();
    await service.recompute(USER, []);
    expect(progressionRepo.upsertStates).not.toHaveBeenCalled();
  });
});

describe('ProgressionService prescriptions, overrides and offers', () => {
  it('forExercises prescribes stored rows and synthesises a start for exercises without one', async () => {
    const { service } = setup({ existing: [progRow()] });

    const dtos = await service.forExercises(USER, ['bench', 'squat'], '2026-09-10');

    expect(dtos.map((d) => `${d.exerciseId}|${d.repBucket}`)).toEqual([
      'bench|6-10',
      'squat|8-12', // the active routine's bucket for squat
    ]);
    expect(prescribe).toHaveBeenCalledWith(
      expect.objectContaining({ today: '2026-09-10', deload: false, override: null }),
    );
  });

  it('prescribes with deload=true while a user-started deload covers today', async () => {
    const { service } = setup({
      existing: [progRow()],
      context: ctx({ offerState: { deload: { startDate: '2026-09-08', endDate: '2026-09-14' } } }),
    });

    await service.forExercises(USER, ['bench'], '2026-09-10');

    expect(prescribe).toHaveBeenCalledWith(expect.objectContaining({ deload: true }));
  });

  it('setOverride stores the override with a timestamp and returns the DTO', async () => {
    const { service, progressionRepo } = setup();
    vi.mocked(progressionRepo.find).mockResolvedValue(progRow());

    const dto = await service.setOverride(USER, {
      exerciseId: 'bench',
      repBucket: '6-10',
      weightKg: 62.5,
      reps: [8, 8, 8],
    });

    const stored = vi.mocked(progressionRepo.setOverride).mock.calls[0]?.[3] as {
      weightKg: number;
      at: string;
    };
    expect(stored.weightKg).toBe(62.5);
    expect(Date.parse(stored.at)).not.toBeNaN();
    expect(dto.exerciseId).toBe('bench');
  });

  it('clearOverride on a missing progression is NOT_FOUND', async () => {
    const { service } = setup();
    await expect(
      service.clearOverride(USER, { exerciseId: 'bench', repBucket: '6-10' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('startDeload records a 7-day window in offerState', async () => {
    const { service, profileRepo } = setup();

    await service.startDeload(USER, '2026-09-10');

    expect(profileRepo.update).toHaveBeenCalledWith(USER, {
      offerState: { deload: { startDate: '2026-09-10', endDate: '2026-09-16' } },
    });
  });

  it('dismissOffer remembers the key; dismissing a deload also ends it', async () => {
    const { service, profileRepo } = setup({
      context: ctx({ offerState: { deload: { startDate: '2026-09-08', endDate: '2026-09-14' } } }),
    });

    await service.dismissOffer(USER, 'deload', 'deload:2026-09-07');

    const saved = vi.mocked(profileRepo.update).mock.calls[0]?.[1].offerState as {
      dismissed: Record<string, string>;
      deload: unknown;
    };
    expect(Object.keys(saved.dismissed)).toEqual(['deload:2026-09-07']);
    expect(saved.deload).toBeNull();
  });

  it('offer bookkeeping needs a finished setup', async () => {
    const { service } = setup({ context: ctx({ profileRow: null }) });
    await expect(service.startDeload(USER)).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  });
});
