import type { Response as ExpressResponse } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserProfile } from '@chefer/types';
import { router } from '../../lib/trpc.js';
import { gymRouter } from './index.js';

// How trainer coaching reaches the gym procedures (spec §7.3, §9.2, §10): the RAW
// `x-chefer-api-level` (not the effective gym level, which the cardio flag caps
// at 2) decides the level-6 shape; `clearTrainerNoteIds` reaches the save;
// setOverride stamps the caller as the setter.

const flags = vi.hoisted(() => ({ coaching: false }));
vi.mock('../../lib/flags.js', () => ({
  isFlagEnabled: (key: string) => key === 'coaching' && flags.coaching,
}));
vi.mock('../../lib/env.js', () => ({
  env: { COACHING_ALLOWLIST: new Set<string>(), TRAINER_ALLOWLIST: new Set<string>() },
}));
vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const bootstrap = vi.hoisted(() => ({ get: vi.fn(async () => 'bootstrap') }));
vi.mock('../../application/gym/gym-bootstrap.service.js', () => ({
  gymBootstrapService: bootstrap,
}));
const routines = vi.hoisted(() => ({
  get: vi.fn(async () => 'get'),
  save: vi.fn(async () => 'save'),
  setActive: vi.fn(async () => 'setActive'),
  setNextDay: vi.fn(async () => 'setNextDay'),
}));
vi.mock('../../application/gym/routine.service.js', () => ({ routineService: routines }));
const progression = vi.hoisted(() => ({
  forExercises: vi.fn(async () => []),
  setOverride: vi.fn(async () => 'setOverride'),
  clearOverride: vi.fn(async () => 'clearOverride'),
}));
vi.mock('../../application/gym/progression.service.js', () => ({
  progressionService: progression,
}));

const ME = 'cme000000000000000000001';
const user: UserProfile = {
  id: ME,
  email: 'me@x.dev',
  name: null,
  firstName: null,
  role: 'USER',
  planTier: 'FREE',
  image: null,
};
const caller = (clientApiLevel: number) =>
  router({ gym: gymRouter }).createCaller({
    user,
    requestId: 't',
    ipAddress: '127.0.0.1',
    sessionToken: null,
    isMobileClient: true,
    clientApiLevel,
    res: {} as ExpressResponse,
  }).gym;

beforeEach(() => {
  vi.clearAllMocks();
  flags.coaching = false;
});

describe('gym.bootstrap', () => {
  it('the effective level is capped by the cardio flag, but coaching gets the RAW level', async () => {
    await caller(6).bootstrap({ today: '2026-10-04' });
    expect(bootstrap.get).toHaveBeenCalledWith(ME, expect.anything(), 2, {
      rawLevel: 6,
      enabled: false,
    });
  });

  it('tells the service whether coaching is on for this user', async () => {
    flags.coaching = true;
    await caller(6).bootstrap();
    expect(bootstrap.get).toHaveBeenCalledWith(ME, expect.anything(), 2, {
      rawLevel: 6,
      enabled: true,
    });
  });
});

describe('gym.routine', () => {
  const routineDoc = {
    id: 'r1',
    name: 'Plan',
    days: [
      {
        id: 'd1',
        name: 'A',
        plannedWeekday: 0,
        exercises: [
          {
            id: 're1',
            exerciseId: 'squat',
            sets: 3,
            repMin: 6,
            repMax: 8,
            targetRir: 2,
            restSec: 120,
            supersetGroup: null,
            notes: null,
            // A client can not write a trainer note: Zod strips it from the input.
            trainerNote: 'forged',
          },
        ],
      },
    ],
  };

  it('save passes the raw level and clearTrainerNoteIds; a forged trainerNote never reaches the service', async () => {
    await caller(6).routine.save({
      routine: routineDoc,
      expectedVersion: 2,
      clearTrainerNoteIds: ['re1'],
    });
    const [, doc, version, opts] = routines.save.mock.calls[0] as unknown as [
      string,
      { days: { exercises: object[] }[] },
      number,
      { level: number; clearTrainerNoteIds: string[] },
    ];
    expect(version).toBe(2);
    expect(opts).toEqual({ level: 6, clearTrainerNoteIds: ['re1'] });
    expect(JSON.stringify(doc)).not.toContain('forged');
  });

  it('an old client sends no clearTrainerNoteIds and its level is passed as is', async () => {
    await caller(4).routine.save({ routine: routineDoc, expectedVersion: 2 });
    expect((routines.save.mock.calls[0] as unknown[] | undefined)?.[3]).toEqual({
      level: 4,
      clearTrainerNoteIds: undefined,
    });
  });

  it('get / setActive / setNextDay pass the raw level', async () => {
    await caller(6).routine.get({ id: 'r1' });
    await caller(6).routine.setActive({ id: 'r1' });
    await caller(6).routine.setNextDay({ routineId: 'r1', dayId: 'd1' });
    expect(routines.get).toHaveBeenCalledWith(ME, 'r1', 6);
    expect(routines.setActive).toHaveBeenCalledWith(ME, 'r1', 6);
    expect(routines.setNextDay).toHaveBeenCalledWith(ME, 'r1', 'd1', 6);
  });
});

describe('gym.progression', () => {
  it('setOverride stamps the caller as the setter (last write wins, attributed)', async () => {
    await caller(6).progression.setOverride({
      exerciseId: 'squat',
      repBucket: '6-8',
      weightKg: 60,
      reps: [8, 8],
    });
    expect(progression.setOverride).toHaveBeenCalledWith(
      ME,
      expect.objectContaining({ exerciseId: 'squat' }),
      { setById: ME, level: 6 },
    );
  });

  it('clearOverride and forExercises pass the raw level', async () => {
    await caller(5).progression.clearOverride({ exerciseId: 'squat', repBucket: '6-8' });
    await caller(5).progression.forExercises({ exerciseIds: ['squat'] });
    expect(progression.clearOverride).toHaveBeenCalledWith(ME, expect.anything(), 5);
    expect(progression.forExercises).toHaveBeenCalledWith(ME, ['squat'], undefined, 5);
  });
});
