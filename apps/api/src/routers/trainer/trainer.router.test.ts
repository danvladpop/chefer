import type { Response as ExpressResponse } from 'express';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { CoachingLink, TrainerProfile } from '@chefer/database';
import { COACHING_COPY, type UserProfile } from '@chefer/types';
import { sessionDoc } from '../../application/gym/__test__/fixtures.js';
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
const dashboard = vi.hoisted(() => ({
  badges: vi.fn(async () => 'badges'),
  summary: vi.fn(async () => 'summary'),
}));
vi.mock('../../application/coaching/trainer-dashboard.service.js', () => ({
  trainerDashboardService: dashboard,
}));
const templates = vi.hoisted(() => ({
  list: vi.fn(async () => 'list'),
  get: vi.fn(async () => 'get'),
  create: vi.fn(async () => 'create'),
  save: vi.fn(async () => 'save'),
  delete: vi.fn(async () => 'delete'),
  assign: vi.fn(async () => 'assign'),
  updateClients: vi.fn(async () => 'updateClients'),
}));
vi.mock('../../application/coaching/workout-template.service.js', () => ({
  workoutTemplateService: templates,
}));
const bookings = vi.hoisted(() => ({
  range: vi.fn(async () => 'range'),
  get: vi.fn(async () => 'get'),
  create: vi.fn(async () => 'create'),
  update: vi.fn(async () => 'update'),
  cancel: vi.fn(async () => 'cancel'),
  markAttendance: vi.fn(async () => 'markAttendance'),
  clientBookings: vi.fn(async () => 'clientBookings'),
}));
vi.mock('../../application/coaching/booking.service.js', () => ({ bookingService: bookings }));
const coach = vi.hoisted(() => ({
  start: vi.fn(async () => 'start'),
  sync: vi.fn(async () => 'sync'),
}));
vi.mock('../../application/coaching/coached-workout.service.js', () => ({
  coachedWorkoutService: coach,
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
    // Listed: the allowlist sweep never ends anything here.
    enforceAllowlist: vi.fn(async () => false),
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
  // Trainer mode M3: every trainer.* call naming a client needs an ACTIVE coaching.
  'client.bookings': {
    call: (clientId) => caller().client.bookings({ clientId, today: '2026-10-19' }),
    reaches: () => bookings.clientBookings,
  },
  'coach.start': {
    call: (clientId) => caller().coach.start({ clientId, today: '2026-10-19' }),
    reaches: () => coach.start,
  },
  'coach.sync': {
    call: (clientId) => caller().coach.sync({ clientId, docs: [sessionDoc()] }),
    reaches: () => coach.sync,
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

// Trainer mode (trainer-mode.md §9): an active trainer's own counts, no client named.
describe.each([
  ['badges', () => caller().badges(), () => dashboard.badges],
  [
    'dashboard.summary',
    () => caller().dashboard.summary({ today: '2026-10-18' }),
    () => dashboard.summary,
  ],
] as const)('trainer.%s', (_name, call, reaches) => {
  it('an active trainer reaches the service with their own id', async () => {
    await call();
    expect(reaches()).toHaveBeenCalledWith(
      ME,
      ...(_name === 'badges' ? [undefined] : ['2026-10-18']),
    );
  });

  it('coaching off: NOT_FOUND; trainer tools off: FORBIDDEN TRAINER_TOOLS_OFF', async () => {
    world.flag = false;
    await expect(call()).rejects.toMatchObject({ code: 'NOT_FOUND' });
    world.flag = true;
    world.trainerOn = false;
    await expect(call()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(reaches()).not.toHaveBeenCalled();
  });
});

it('trainer.dashboard.summary rejects a malformed date before the service', async () => {
  await expect(caller().dashboard.summary({ today: '18/10/2026' })).rejects.toMatchObject({
    code: 'BAD_REQUEST',
  });
  expect(dashboard.summary).not.toHaveBeenCalled();
});

// Trainer mode M2 (trainer-mode.md §9): trainer.templates.* are the trainer's own
// documents. Clients named in assign / updateClients are checked per client by
// the service (a per-client result), so the router only needs an active trainer.
const templateDoc = {
  name: 'Lower body A',
  workoutType: null,
  exercises: [
    {
      exerciseId: 'squat',
      sets: 3,
      repMin: 6,
      repMax: 8,
      targetRir: 2,
      restSec: 120,
      supersetGroup: null,
      defaultLoadKg: 60,
      trainerNote: null,
    },
  ],
};
describe.each([
  ['list', () => caller().templates.list(), [ME]],
  ['get', () => caller().templates.get({ templateId: 't1' }), [ME, 't1']],
  ['create', () => caller().templates.create(templateDoc), [ME, templateDoc]],
  [
    'save',
    () => caller().templates.save({ templateId: 't1', template: templateDoc, expectedVersion: 1 }),
    [ME, { templateId: 't1', template: templateDoc, expectedVersion: 1 }],
  ],
  ['delete', () => caller().templates.delete({ templateId: 't1' }), [ME, 't1']],
  [
    'assign',
    () =>
      caller().templates.assign({
        templateId: 't1',
        targets: [{ clientId: CLIENT, mode: 'ADD_DAY' }],
      }),
    [ME, { templateId: 't1', targets: [{ clientId: CLIENT, mode: 'ADD_DAY' }] }],
  ],
  [
    'updateClients',
    () => caller().templates.updateClients({ templateId: 't1', clientIds: [CLIENT] }),
    [ME, { templateId: 't1', clientIds: [CLIENT] }],
  ],
] as const)('trainer.templates.%s', (name, call, args) => {
  const reaches = () => templates[name];

  it('an active trainer reaches the service with their own id', async () => {
    await expect(call()).resolves.toBe(name);
    expect(reaches()).toHaveBeenCalledWith(...args);
  });

  it('coaching off: NOT_FOUND; trainer tools off: FORBIDDEN TRAINER_TOOLS_OFF', async () => {
    world.flag = false;
    await expect(call()).rejects.toMatchObject({ code: 'NOT_FOUND' });
    world.flag = true;
    world.trainerOn = false;
    await expect(call()).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: COACHING_COPY.server.trainerToolsOff,
    });
    expect(reaches()).not.toHaveBeenCalled();
  });
});

describe('trainer.templates input limits', () => {
  it('more than 20 exercises is a BAD_REQUEST before the service', async () => {
    const big = {
      ...templateDoc,
      exercises: Array.from({ length: 21 }, () => templateDoc.exercises[0]!),
    };
    await expect(caller().templates.create(big)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(templates.create).not.toHaveBeenCalled();
  });

  it('REPLACE_DAY without a day is a BAD_REQUEST before the service', async () => {
    await expect(
      caller().templates.assign({
        templateId: 't1',
        targets: [{ clientId: CLIENT, mode: 'REPLACE_DAY' }],
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(templates.assign).not.toHaveBeenCalled();
  });
});

// Trainer mode M3 (trainer-mode.md §9): trainer.bookings.* are the trainer's own
// calendar; clients named in a booking are checked by the service at save.
const bookingInput = {
  kind: 'BOOKING' as const,
  date: '2026-10-20',
  time: '18:00',
  timeZone: 'Europe/Bucharest',
  durationMin: 60,
  clients: [{ clientId: CLIENT }],
};
describe.each([
  [
    'range',
    () => caller().bookings.range({ from: '2026-10-19T00:00:00Z', to: '2026-10-26T00:00:00Z' }),
    [ME, new Date('2026-10-19T00:00:00Z'), new Date('2026-10-26T00:00:00Z')],
  ],
  ['get', () => caller().bookings.get({ bookingId: 'b1' }), [ME, 'b1']],
  ['create', () => caller().bookings.create(bookingInput), [ME, bookingInput]],
  [
    'update',
    () =>
      caller().bookings.update({ bookingId: 'b1', expectedVersion: 1, patch: { time: '19:00' } }),
    [ME, { bookingId: 'b1', expectedVersion: 1, scope: 'THIS', patch: { time: '19:00' } }],
  ],
  [
    'cancel',
    () => caller().bookings.cancel({ bookingId: 'b1', scope: 'FOLLOWING' }),
    [ME, { bookingId: 'b1', scope: 'FOLLOWING' }],
  ],
  [
    'markAttendance',
    () =>
      caller().bookings.markAttendance({
        bookingId: 'b1',
        clientId: CLIENT,
        attendance: 'ATTENDED',
      }),
    [ME, { bookingId: 'b1', clientId: CLIENT, attendance: 'ATTENDED' }],
  ],
] as const)('trainer.bookings.%s', (name, call, args) => {
  const reaches = () => bookings[name];

  it('an active trainer reaches the service with their own id', async () => {
    await expect(call()).resolves.toBe(name);
    expect(reaches()).toHaveBeenCalledWith(...args);
  });

  it('coaching off: NOT_FOUND; trainer tools off: FORBIDDEN TRAINER_TOOLS_OFF', async () => {
    world.flag = false;
    await expect(call()).rejects.toMatchObject({ code: 'NOT_FOUND' });
    world.flag = true;
    world.trainerOn = false;
    await expect(call()).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: COACHING_COPY.server.trainerToolsOff,
    });
    expect(reaches()).not.toHaveBeenCalled();
  });
});

describe('trainer.bookings / trainer.coach input limits and identity', () => {
  it('7 clients is a BAD_REQUEST before the service', async () => {
    const seven = Array.from({ length: 7 }, () => ({ clientId: CLIENT }));
    await expect(
      caller().bookings.create({ ...bookingInput, clients: seven }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(bookings.create).not.toHaveBeenCalled();
  });

  it('blocked time with a client, or a booking without one, is a BAD_REQUEST', async () => {
    await expect(
      caller().bookings.create({ ...bookingInput, kind: 'BLOCK' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(caller().bookings.create({ ...bookingInput, clients: [] })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    expect(bookings.create).not.toHaveBeenCalled();
  });

  it('a range over six weeks is a BAD_REQUEST', async () => {
    await expect(
      caller().bookings.range({ from: '2026-10-01T00:00:00Z', to: '2026-12-01T00:00:00Z' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('coach.sync: loggedById is the caller from ctx; a client-sent id never reaches the service', async () => {
    const doc = { ...sessionDoc(), loggedById: CLIENT, bookingId: 'b1' };
    await caller().coach.sync({ clientId: CLIENT, docs: [doc] });
    const [access, loggedById, docs] = coach.sync.mock.calls[0] as unknown as [
      { trainerId: string; clientId: string },
      string,
      Record<string, unknown>[],
    ];
    expect(access).toMatchObject({ trainerId: ME, clientId: CLIENT });
    expect(loggedById).toBe(ME);
    expect(docs[0]).not.toHaveProperty('loggedById');
    expect(docs[0]?.['bookingId']).toBe('b1');
  });

  it('coach.start passes the booking (or null) and the device date', async () => {
    await caller().coach.start({ clientId: CLIENT, bookingId: 'b1', today: '2026-10-19' });
    expect(coach.start).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: CLIENT }),
      'b1',
      '2026-10-19',
    );
    await caller().coach.start({ clientId: CLIENT, today: '2026-10-19' });
    expect(coach.start).toHaveBeenLastCalledWith(expect.anything(), null, '2026-10-19');
  });
});
