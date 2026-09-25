import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IGymProfileRepository } from '@chefer/database';
import { TEMPLATE_BY_KEY, type CompleteSetupInput } from '@chefer/types';
import {
  estimateDurationMin,
  initialState,
  instantiateTemplate,
  recommendTemplate,
  validateRoutine,
  volumeByGroup,
} from '@chefer/utils';
import { profileRow, progressionState, routineRow } from './__test__/fixtures.js';
import { defaultInventory, GymProfileService } from './gym-profile.service.js';

vi.mock('@chefer/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@chefer/utils')>()),
  initialState: vi.fn(),
  instantiateTemplate: vi.fn(),
  recommendTemplate: vi.fn(),
  validateRoutine: vi.fn(),
  volumeByGroup: vi.fn(),
  estimateDurationMin: vi.fn(),
  weekStartOf: vi.fn(() => '2026-09-21'),
}));

const USER = 'u1';
const TEMPLATE = 'fb2-beginner';

/** Engine stand-in for instantiateTemplate: the static template, no swaps. */
function fakeInstantiate(key: string) {
  const t = TEMPLATE_BY_KEY.get(key);
  if (!t) throw new Error(`no template ${key}`);
  return {
    name: t.name,
    templateKey: t.key,
    weeklyGoal: t.daysPerWeek,
    days: t.days.map((d) => ({
      name: d.name,
      plannedWeekday: d.plannedWeekday,
      exercises: d.exercises.map((e) => ({
        exerciseId: e.exerciseId,
        sets: e.sets,
        repMin: e.repMin,
        repMax: e.repMax,
        targetRir: 2,
        restSec: 120,
        supersetGroup: null,
        notes: null,
      })),
    })),
  };
}

function setupInput(over: Partial<CompleteSetupInput> = {}): CompleteSetupInput {
  return {
    days: 2,
    experience: 'BEGINNER',
    equipmentAccess: 'FULL_GYM',
    unit: 'KG',
    templateKey: TEMPLATE,
    plannedWeekdays: [1, 4],
    reminderTime: '18:30',
    ...over,
  };
}

function setup(existing = null as ReturnType<typeof profileRow> | null) {
  const repo: IGymProfileRepository = {
    findByUserId: vi.fn().mockResolvedValue(existing),
    update: vi.fn((_u: string, data) => Promise.resolve(profileRow({ ...data } as never))),
    completeSetup: vi.fn().mockResolvedValue({ profile: profileRow(), routine: routineRow() }),
  };
  const bootstrap = {
    get: vi.fn().mockResolvedValue({ profile: null }),
  };
  const ensure = vi.fn().mockResolvedValue(undefined);
  return { service: new GymProfileService(repo, bootstrap, ensure), repo, bootstrap, ensure };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(instantiateTemplate).mockImplementation((key) => fakeInstantiate(key));
  vi.mocked(initialState).mockImplementation(({ knownWeightKg }) =>
    progressionState({ workingWeightKg: knownWeightKg ?? 0, calibrating: knownWeightKg == null }),
  );
});

describe('GymProfileService.completeSetup', () => {
  it('writes profile + active routine + initial progressions in one repository call', async () => {
    const { service, repo, bootstrap, ensure } = setup();

    await service.completeSetup(USER, setupInput(), '2026-09-24');

    expect(ensure).toHaveBeenCalled();
    expect(repo.completeSetup).toHaveBeenCalledTimes(1);
    const data = vi.mocked(repo.completeSetup).mock.calls[0]![1];

    // Active routine from the template, planned weekdays applied per day.
    expect(data.routine).toMatchObject({ templateKey: TEMPLATE, isActive: true });
    expect(data.routine.days.map((d) => d.plannedWeekday)).toEqual([1, 4]);

    // One progression per distinct (exercise, rep bucket) in the routine.
    const template = TEMPLATE_BY_KEY.get(TEMPLATE)!;
    const expectedKeys = new Set(
      template.days.flatMap((d) =>
        d.exercises.map((e) => `${e.exerciseId}|${e.repMin}-${e.repMax}`),
      ),
    );
    expect(new Set(data.progressions.map((p) => `${p.exerciseId}|${p.repBucket}`))).toEqual(
      expectedKeys,
    );
    expect(data.progressions.every((p) => p.engineVersion === 1)).toBe(true);

    // Profile: goal from the template, goal history from this week, reminder on.
    expect(data.profile).toMatchObject({
      experience: 'BEGINNER',
      unit: 'KG',
      weeklyGoal: template.daysPerWeek,
      barWeightKg: 20,
      reminderEnabled: true,
      reminderTime: '18:30',
      goalHistory: [{ fromWeek: '2026-09-21', goal: template.daysPerWeek }],
    });

    // Returns a fresh bootstrap for the same device-local day.
    expect(bootstrap.get).toHaveBeenCalledWith(USER, { today: '2026-09-24' });
  });

  it('honours "I know my weights" in the initial states and keeps them for recomputes', async () => {
    const { service, repo } = setup();

    await service.completeSetup(
      USER,
      setupInput({ knownWeightsKg: { 'goblet-squat': 24.004 } }),
      '2026-09-24',
    );

    expect(initialState).toHaveBeenCalledWith(expect.objectContaining({ knownWeightKg: 24 }));
    const data = vi.mocked(repo.completeSetup).mock.calls[0]![1];
    expect(data.profile.offerState).toMatchObject({ knownWeightsKg: { 'goblet-squat': 24 } });
  });

  it('gives pound users native pound plates stored as kg', async () => {
    const { service, repo } = setup();

    await service.completeSetup(USER, setupInput({ unit: 'LB' }), '2026-09-24');

    const profile = vi.mocked(repo.completeSetup).mock.calls[0]![1].profile;
    expect(profile.unit).toBe('LB');
    expect(profile.barWeightKg).toBe(20.41); // 45 lb
    expect(profile.platePairsKg[0]).toBe(20.41); // 45 lb plate
    expect(defaultInventory('LB').cableStepKg).toBe(2.27); // 5 lb
  });

  it('rejects an unknown template before touching the database', async () => {
    const { service, repo } = setup();

    await expect(
      service.completeSetup(USER, setupInput({ templateKey: 'nope' }), '2026-09-24'),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(repo.completeSetup).not.toHaveBeenCalled();
  });
});

describe('GymProfileService.save / recommend', () => {
  it('save needs a finished setup', async () => {
    const { service } = setup(null);
    await expect(service.save(USER, { unit: 'LB' })).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });
  });

  it('a weekly-goal change is appended to goalHistory from this week on', async () => {
    const { service, repo } = setup(profileRow({ weeklyGoal: 3 }));

    await service.save(USER, { weeklyGoal: 4 }, '2026-09-24');

    expect(repo.update).toHaveBeenCalledWith(USER, {
      weeklyGoal: 4,
      goalHistory: [
        { fromWeek: '2026-08-31', goal: 3 },
        { fromWeek: '2026-09-21', goal: 4 },
      ],
    });
  });

  it('only sends the fields that were provided; clearing the time turns reminders off', async () => {
    const { service, repo } = setup(profileRow());

    await service.save(USER, { reminderTime: null, platePairsKg: [20.004, 10] });

    expect(repo.update).toHaveBeenCalledWith(USER, {
      reminderTime: null,
      reminderEnabled: false,
      platePairsKg: [20, 10],
    });
  });

  it('recommend is a pure engine composition (no repository calls)', () => {
    vi.mocked(recommendTemplate).mockReturnValue({
      key: TEMPLATE,
      reason: 'Two days a week',
      alternatives: ['fb2-intermediate', 'not-a-template'],
    });
    vi.mocked(estimateDurationMin).mockReturnValue(45);
    vi.mocked(volumeByGroup).mockReturnValue([]);
    vi.mocked(validateRoutine).mockReturnValue([]);
    const { service, repo } = setup();

    const res = service.recommend({ days: 2, experience: 'BEGINNER', equipmentAccess: 'FULL_GYM' });

    expect(res.recommendedKey).toBe(TEMPLATE);
    expect(res.alternatives.map((a) => a.key)).toEqual(['fb2-intermediate']);
    expect(res.preview.days.every((d) => d.estimatedMin === 45)).toBe(true);
    expect(validateRoutine).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(Function),
      'BEGINNER',
      {
        suppressLowVolume: true,
      },
    );
    expect(repo.findByUserId).not.toHaveBeenCalled();
  });
});
