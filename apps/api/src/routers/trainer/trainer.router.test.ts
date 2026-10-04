import type { Response as ExpressResponse } from 'express';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { CoachingLink, TrainerProfile } from '@chefer/database';
import { COACHING_COPY, type UserProfile } from '@chefer/types';
import { resetRateLimits } from '../../lib/rate-limit.js';
import { router, type Context } from '../../lib/trpc.js';
import { trainerRouter } from './index.js';

// The access matrix THROUGH THE ROUTER (spec §7.1, §8.1): every trainer.client.*
// procedure × {no link, ended link, active link, yourself, a stranger's id,
// coaching off, trainer tools off}. Only an ACTIVE link reaches the service; every
// other case is the same NOT_FOUND "This client isn't available" (coaching off:
// NOT_FOUND "Not found"; tools off: FORBIDDEN + reason TRAINER_TOOLS_OFF).

const world = vi.hoisted(() => ({
  flag: true,
  trainerOn: true,
  link: 'active',
}));
vi.mock('../../lib/flags.js', () => ({
  isFlagEnabled: (key: string) => key === 'coaching' && world.flag,
}));
vi.mock('../../lib/env.js', () => ({
  env: { COACHING_ALLOWLIST: new Set<string>(), TRAINER_ALLOWLIST: new Set(['*']) },
}));
vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const ME = 'ctrainer0000000000000001';
const CLIENT = 'cclient00000000000000001';
const OTHER = 'cstranger000000000000001';

vi.mock('@chefer/database', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@chefer/database')>();
  return {
    ...mod,
    trainerProfileRepository: {
      findActive: vi.fn(async (id: string) =>
        world.trainerOn && id === ME
          ? ({ userId: ME, displayName: 'Ana', disabledAt: null } as TrainerProfile)
          : null,
      ),
    },
    // Only ACTIVE links are ever returned by the repository.
    coachingLinkRepository: {
      findActivePair: vi.fn(async (t: string, c: string) =>
        world.link === 'active' && t === ME && c === CLIENT
          ? ({ id: 'l1', trainerId: ME, clientId: CLIENT, status: 'ACTIVE' } as CoachingLink)
          : null,
      ),
    },
    coachingNoteRepository: { find: vi.fn(async () => null) },
  };
});

const content = vi.hoisted(() => ({
  overview: vi.fn(async () => 'overview'),
  workouts: vi.fn(async () => 'workouts'),
  exerciseHistory: vi.fn(async () => 'exerciseHistory'),
  routine: vi.fn(async () => 'routine'),
}));
vi.mock('../../application/coaching/coaching-content.service.js', () => ({
  coachingContentService: content,
}));
const routineWrites = vi.hoisted(() => ({
  saveRoutine: vi.fn(async () => 'saveRoutine'),
  createRoutine: vi.fn(async () => 'createRoutine'),
  setNextTarget: vi.fn(async () => 'setNextTarget'),
  clearNextTarget: vi.fn(async () => 'clearNextTarget'),
}));
vi.mock('../../application/coaching/trainer-routine.service.js', () => ({
  trainerRoutineService: routineWrites,
}));
const notes = vi.hoisted(() => ({
  get: vi.fn(async () => 'note'),
  save: vi.fn(async () => 'saveNote'),
}));
vi.mock('../../application/coaching/coaching-note.service.js', () => ({
  coachingNoteService: notes,
}));
const links = vi.hoisted(() => ({
  removeClient: vi.fn(async () => 'remove'),
  listClients: vi.fn(async () => []),
}));
vi.mock('../../application/coaching/coaching-link.service.js', () => ({
  coachingLinkService: links,
}));
vi.mock('../../application/coaching/coaching-invite.service.js', () => ({
  coachingInviteService: { list: vi.fn(), create: vi.fn(), revoke: vi.fn() },
}));
vi.mock('../../application/coaching/trainer-profile.service.js', () => ({
  trainerProfileService: {
    status: vi.fn(async () => 'status'),
    activate: vi.fn(),
    updateProfile: vi.fn(),
    deactivate: vi.fn(),
  },
}));

const user: UserProfile = {
  id: ME,
  email: 'ana@x.dev',
  name: null,
  firstName: null,
  role: 'USER',
  planTier: 'FREE',
  image: null,
};
const ctx = (clientApiLevel = 6): Context => ({
  user,
  requestId: 't',
  ipAddress: '127.0.0.1',
  sessionToken: null,
  isMobileClient: true,
  clientApiLevel,
  res: {} as ExpressResponse,
});
const caller = (level?: number) =>
  router({ trainer: trainerRouter }).createCaller(ctx(level)).trainer;

const routineDoc = {
  id: 'r1',
  name: 'Plan',
  days: [
    {
      name: 'A',
      plannedWeekday: 0,
      exercises: [
        {
          exerciseId: 'squat',
          sets: 3,
          repMin: 6,
          repMax: 8,
          targetRir: 2,
          restSec: 120,
          supersetGroup: null,
          trainerNote: null,
        },
      ],
    },
  ],
};

type Call = (clientId: string) => Promise<unknown>;
const PROCEDURES: Record<string, { call: Call; reaches: () => Mock }> = {
  overview: {
    call: (clientId) => caller().client.overview({ clientId, today: '2026-10-04' }),
    reaches: () => content.overview,
  },
  workouts: {
    call: (clientId) => caller().client.workouts({ clientId }),
    reaches: () => content.workouts,
  },
  exerciseHistory: {
    call: (clientId) => caller().client.exerciseHistory({ clientId, exerciseId: 'squat' }),
    reaches: () => content.exerciseHistory,
  },
  routine: {
    call: (clientId) => caller().client.routine({ clientId }),
    reaches: () => content.routine,
  },
  saveRoutine: {
    call: (clientId) =>
      caller().client.saveRoutine({ clientId, routine: routineDoc, expectedVersion: 1 }),
    reaches: () => routineWrites.saveRoutine,
  },
  createRoutine: {
    call: (clientId) => caller().client.createRoutine({ clientId, days: 2 }),
    reaches: () => routineWrites.createRoutine,
  },
  setNextTarget: {
    call: (clientId) =>
      caller().client.setNextTarget({
        clientId,
        exerciseId: 'squat',
        repBucket: '6-8',
        weightKg: 62.5,
        reps: [6, 6],
      }),
    reaches: () => routineWrites.setNextTarget,
  },
  clearNextTarget: {
    call: (clientId) =>
      caller().client.clearNextTarget({ clientId, exerciseId: 'squat', repBucket: '6-8' }),
    reaches: () => routineWrites.clearNextTarget,
  },
  note: { call: (clientId) => caller().client.note({ clientId }), reaches: () => notes.get },
  saveNote: {
    call: (clientId) => caller().client.saveNote({ clientId, body: 'x' }),
    reaches: () => notes.save,
  },
  'clients.remove': {
    call: (clientId) => caller().clients.remove({ clientId }),
    reaches: () => links.removeClient,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimits();
  world.flag = true;
  world.trainerOn = true;
  world.link = 'active';
});

describe.each(Object.entries(PROCEDURES))('trainer.%s', (_name, { call, reaches }) => {
  it('an ACTIVE link reaches the service with the resolved access', async () => {
    await call(CLIENT);
    expect(reaches()).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      'no link',
      (): void => {
        world.link = 'none';
      },
      CLIENT,
    ],
    [
      'an ended link',
      (): void => {
        world.link = 'ended';
      },
      CLIENT,
    ],
    ['yourself', (): void => undefined, ME],
    ["a stranger's id", (): void => undefined, OTHER],
  ] as const)(
    '%s: the one uniform NOT_FOUND, the service is never reached',
    async (_n, arrange, id) => {
      arrange();
      await expect(call(id)).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: COACHING_COPY.server.clientUnavailable,
      });
      expect(reaches()).not.toHaveBeenCalled();
    },
  );

  it('coaching off for this user: NOT_FOUND, the service is never reached', async () => {
    world.flag = false;
    await expect(call(CLIENT)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(reaches()).not.toHaveBeenCalled();
  });

  it('trainer tools off: FORBIDDEN with reason TRAINER_TOOLS_OFF', async () => {
    world.trainerOn = false;
    await expect(call(CLIENT)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(reaches()).not.toHaveBeenCalled();
  });
});

describe('trainer.* wiring', () => {
  it('a malformed clientId is a BAD_REQUEST, not a denial', async () => {
    await expect(caller().client.routine({ clientId: '' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('the trainer reads with the effective level (cardio flag off caps at 2)', async () => {
    await caller(6).client.workouts({ clientId: CLIENT });
    expect(content.workouts).toHaveBeenCalledWith(expect.anything(), expect.anything(), 2);
  });

  it('the saved note body reaches only the note service', async () => {
    await caller().client.saveNote({ clientId: CLIENT, body: 'private text' });
    expect(notes.save).toHaveBeenCalledWith(expect.anything(), 'private text');
  });

  it('a note over 4000 characters is rejected before the service', async () => {
    await expect(
      caller().client.saveNote({ clientId: CLIENT, body: 'x'.repeat(4001) }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(notes.save).not.toHaveBeenCalled();
  });

  it('a trainer note over 200 characters is rejected before the service', async () => {
    const long = {
      ...routineDoc,
      days: [
        {
          ...routineDoc.days[0],
          exercises: [{ ...routineDoc.days[0]?.exercises[0], trainerNote: 'x'.repeat(201) }],
        },
      ],
    };
    await expect(
      caller().client.saveRoutine({ clientId: CLIENT, routine: long as never, expectedVersion: 1 }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(routineWrites.saveRoutine).not.toHaveBeenCalled();
  });

  it('trainer.status answers a non-trainer (coachingProcedure, not trainerProcedure)', async () => {
    world.trainerOn = false;
    await expect(caller().status()).resolves.toBe('status');
  });
});
