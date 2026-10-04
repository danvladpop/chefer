import { describe, expect, it, vi } from 'vitest';
import type {
  ActiveLinkWithClient,
  CoachingInvite,
  CoachingLink,
  GymProfile,
  JoinLinkResult,
} from '@chefer/database';
import { COACHING_LIMITS, LEGAL_VERSIONS } from '@chefer/types';
import { CoachingLinkService } from './coaching-link.service.js';

// Join edge cases (expired, used, revoked, self, switch, already yours, needs
// setup, client cap, a lost race), status, leave, remove and the client list.

// gym/mappers.ts → exercise-library/ensure.ts → lib/env.ts (throws without secrets).
vi.mock('../../lib/env.js', () => ({ env: {} }));

const NOW = new Date('2026-10-07T12:00:00Z'); // a Wednesday
const DAY = 24 * 60 * 60 * 1000;
const TRAINER = 'ctrainer0000000000000001';
const OTHER = 'ctrainer0000000000000002';
const CLIENT = 'cclient00000000000000001';

const invite = (over: Partial<CoachingInvite> = {}): CoachingInvite => ({
  code: 'ABCDEFGHJK',
  trainerId: TRAINER,
  label: 'Maria, Tue/Thu',
  createdAt: new Date(NOW.getTime() - DAY),
  expiresAt: new Date(NOW.getTime() + 13 * DAY),
  usedAt: null,
  usedById: null,
  revokedAt: null,
  ...over,
});
const link = (over: Partial<CoachingLink> = {}): CoachingLink => ({
  id: 'l1',
  trainerId: TRAINER,
  clientId: CLIENT,
  status: 'ACTIVE',
  inviteCode: 'ABCDEFGHJK',
  trainerLabel: null,
  startedAt: new Date('2026-10-01T09:00:00Z'),
  endedAt: null,
  endedBy: null,
  ...over,
});
const profile = (over: Partial<GymProfile> = {}): GymProfile =>
  ({
    userId: CLIENT,
    weeklyGoal: 3,
    goalHistory: [],
    setupCompletedAt: new Date('2026-09-01T00:00:00Z'),
    ...over,
  }) as GymProfile;

interface Opts {
  invite?: CoachingInvite | null;
  current?: CoachingLink | null;
  stopped?: CoachingLink | null;
  gym?: GymProfile | null;
  joinResult?: JoinLinkResult[];
}

function setup(opts: Opts = {}) {
  const joinResults = [
    ...(opts.joinResult ?? [{ status: 'joined', link: link(), endedLinks: [] }]),
  ];
  const links = {
    findActivePair: vi.fn(),
    findActiveForClient: vi.fn(async () => opts.current ?? null),
    listActiveForTrainer: vi.fn(async (): Promise<ActiveLinkWithClient[]> => []),
    countActiveForTrainer: vi.fn(),
    findLatestStoppedForClient: vi.fn(async () => opts.stopped ?? null),
    join: vi.fn(async () => joinResults.shift() ?? ({ status: 'invite_unavailable' } as const)),
    end: vi.fn(async () => link({ status: 'ENDED' })),
    deleteEndedBefore: vi.fn(),
  };
  const content = {
    lastWorkoutDates: vi.fn(async () => new Map<string, string>()),
    countSessions: vi.fn(async () => new Map<string, number>()),
    gymProfiles: vi.fn(async () => new Map<string, GymProfile>()),
    activeRoutineStamps: vi.fn(async () => new Map()),
    listCompleted: vi.fn(),
    listCompletedForExercise: vi.fn(),
    userNames: vi.fn(),
  };
  const service = new CoachingLinkService({
    links,
    invites: {
      find: vi.fn(async () => (opts.invite === undefined ? invite() : opts.invite)),
    },
    trainers: {
      find: vi.fn(async (id: string) =>
        id === TRAINER
          ? { userId: id, displayName: 'Ana', activatedAt: NOW, disabledAt: null }
          : id === OTHER
            ? { userId: id, displayName: 'Ion', activatedAt: NOW, disabledAt: null }
            : null,
      ),
      findMany: vi.fn(),
    },
    gymProfiles: {
      findByUserId: vi.fn(async () => (opts.gym === undefined ? profile() : opts.gym)),
    },
    content,
    now: () => NOW,
  });
  return { service, links, content };
}

describe('join', () => {
  it('claims the invite in one transaction and answers with the new status', async () => {
    const { service, links } = setup();
    // The repository wrote the link; status() then reads it.
    links.findActiveForClient.mockResolvedValueOnce(null).mockResolvedValue(link());
    const status = await service.join(CLIENT, 'ABCDEFGHJK', 'mobile');
    expect(links.join).toHaveBeenCalledWith({
      code: 'ABCDEFGHJK',
      clientId: CLIENT,
      source: 'mobile',
      documentVersion: LEGAL_VERSIONS.privacy,
      maxActiveClients: COACHING_LIMITS.maxActiveClients,
      now: NOW,
    });
    expect(status).toEqual({
      trainer: { name: 'Ana', since: '2026-10-01T09:00:00.000Z' },
      stopped: null,
    });
  });

  it.each([
    ['unknown code', { invite: null }],
    ['used', { invite: invite({ usedAt: NOW }) }],
    ['revoked', { invite: invite({ revokedAt: NOW }) }],
    ['expired', { invite: invite({ expiresAt: new Date(NOW.getTime() - 1) }) }],
  ])('%s: BAD_REQUEST, nothing written', async (_n, opts) => {
    const { service, links } = setup(opts);
    await expect(service.join(CLIENT, 'ABCDEFGHJK', 'web')).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    expect(links.join).not.toHaveBeenCalled();
  });

  it('your own invite: BAD_REQUEST', async () => {
    const { service, links } = setup({ invite: invite({ trainerId: CLIENT }) });
    await expect(service.join(CLIENT, 'ABCDEFGHJK', 'web')).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    expect(links.join).not.toHaveBeenCalled();
  });

  it('already coached by this trainer: a no-op that returns the status (even for a used invite)', async () => {
    const { service, links } = setup({
      current: link(),
      invite: invite({ usedAt: NOW, usedById: CLIENT }),
    });
    expect((await service.join(CLIENT, 'ABCDEFGHJK', 'web')).trainer?.name).toBe('Ana');
    expect(links.join).not.toHaveBeenCalled();
  });

  it('a switch to another trainer goes through the repository (which ends the old link and logs both events)', async () => {
    const { service, links } = setup({
      current: link({ trainerId: OTHER }),
      joinResult: [{ status: 'joined', link: link(), endedLinks: [link({ trainerId: OTHER })] }],
    });
    await service.join(CLIENT, 'ABCDEFGHJK', 'web');
    expect(links.join).toHaveBeenCalledTimes(1);
  });

  it('needs a finished gym setup: PRECONDITION_FAILED, nothing written', async () => {
    for (const gym of [null, profile({ setupCompletedAt: null })]) {
      const { service, links } = setup({ gym });
      await expect(service.join(CLIENT, 'ABCDEFGHJK', 'web')).rejects.toMatchObject({
        code: 'PRECONDITION_FAILED',
      });
      expect(links.join).not.toHaveBeenCalled();
    }
  });

  it('the trainer is at the client cap: BAD_REQUEST', async () => {
    const { service } = setup({ joinResult: [{ status: 'client_limit' }] });
    await expect(service.join(CLIENT, 'ABCDEFGHJK', 'web')).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('the invite was claimed between the check and the transaction: BAD_REQUEST', async () => {
    const { service } = setup({ joinResult: [{ status: 'invite_unavailable' }] });
    await expect(service.join(CLIENT, 'ABCDEFGHJK', 'web')).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('loses a race for the one-ACTIVE-link index: retries once, then succeeds', async () => {
    const { service, links } = setup({
      joinResult: [{ status: 'conflict' }, { status: 'joined', link: link(), endedLinks: [] }],
    });
    await service.join(CLIENT, 'ABCDEFGHJK', 'web');
    expect(links.join).toHaveBeenCalledTimes(2);
  });

  it('loses the race twice: CONFLICT', async () => {
    const { service } = setup({ joinResult: [{ status: 'conflict' }, { status: 'conflict' }] });
    await expect(service.join(CLIENT, 'ABCDEFGHJK', 'web')).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });
});

describe('status', () => {
  it('no trainer and nothing recent: both null', async () => {
    expect(await setup().service.status(CLIENT)).toEqual({ trainer: null, stopped: null });
  });

  it('"<trainer> stopped coaching you": the trainer removed the client in the last 30 days', async () => {
    const endedAt = new Date(NOW.getTime() - 2 * DAY);
    const { service, links } = setup({
      stopped: link({ status: 'ENDED', endedAt, endedBy: 'TRAINER' }),
    });
    expect(await service.status(CLIENT)).toEqual({
      trainer: null,
      stopped: { trainerName: 'Ana', at: endedAt.toISOString() },
    });
    expect(links.findLatestStoppedForClient).toHaveBeenCalledWith(
      CLIENT,
      new Date(NOW.getTime() - COACHING_LIMITS.stoppedNoticeDays * DAY),
    );
  });

  it('an active trainer wins: no stopped notice', async () => {
    const { service } = setup({
      current: link(),
      stopped: link({ status: 'ENDED', endedAt: NOW, endedBy: 'TRAINER' }),
    });
    expect((await service.status(CLIENT)).stopped).toBeNull();
  });

  it('a trainer whose account is gone reads "your trainer"', async () => {
    const { service } = setup({ current: link({ trainerId: 'cgone0000000000000000001' }) });
    expect((await service.status(CLIENT)).trainer?.name).toBe('your trainer');
  });
});

describe('leave and remove', () => {
  it('leave ends the link as CLIENT with the privacy version and the platform', async () => {
    const { service, links } = setup({ current: link() });
    links.findActiveForClient.mockResolvedValueOnce(link()).mockResolvedValue(null);
    expect(await service.leave(CLIENT, 'mobile')).toEqual({ trainer: null, stopped: null });
    expect(links.end).toHaveBeenCalledWith({
      trainerId: TRAINER,
      clientId: CLIENT,
      endedBy: 'CLIENT',
      source: 'mobile',
      documentVersion: LEGAL_VERSIONS.privacy,
      now: NOW,
    });
  });

  it('leave without a trainer is harmless', async () => {
    const { service, links } = setup();
    await service.leave(CLIENT, 'web');
    expect(links.end).not.toHaveBeenCalled();
  });

  it('remove ends the link as TRAINER; removing someone who is not your client is the uniform NOT_FOUND', async () => {
    const { service, links } = setup();
    await expect(service.removeClient(TRAINER, CLIENT, 'web')).resolves.toEqual({ ok: true });
    expect(links.end).toHaveBeenCalledWith(expect.objectContaining({ endedBy: 'TRAINER' }));
    links.end.mockResolvedValueOnce(null as never);
    await expect(service.removeClient(TRAINER, CLIENT, 'web')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('listClients', () => {
  const row = (over: Partial<ActiveLinkWithClient> = {}): ActiveLinkWithClient => ({
    ...link(),
    client: { id: CLIENT, firstName: 'Maria', lastName: 'Pop', name: null },
    ...over,
  });

  it('no clients: no queries beyond the list', async () => {
    const { service, content } = setup();
    expect(await service.listClients(TRAINER, '2026-10-07')).toEqual([]);
    expect(content.lastWorkoutDates).not.toHaveBeenCalled();
  });

  it('one row per client: name, label, last workout, this week against the goal, quiet days', async () => {
    const { service, links, content } = setup();
    links.listActiveForTrainer.mockResolvedValue([row({ trainerLabel: 'Maria, Tue/Thu' })]);
    content.lastWorkoutDates.mockResolvedValue(new Map([[CLIENT, '2026-09-30']]));
    content.countSessions.mockResolvedValue(new Map([[CLIENT, 2]]));
    content.gymProfiles.mockResolvedValue(new Map([[CLIENT, profile({ weeklyGoal: 3 })]]));
    const [out] = await service.listClients(TRAINER, '2026-10-07');
    expect(out).toEqual({
      clientId: CLIENT,
      name: 'Maria Pop',
      since: '2026-10-01T09:00:00.000Z',
      label: 'Maria, Tue/Thu',
      lastWorkoutDate: '2026-09-30',
      week: { sessions: 2, goal: 3 },
      inactiveDays: 7,
      routineChangedByClientAt: null,
    });
    // The week is the trainer's device-local week (Mon 5 Oct – Sun 11 Oct).
    expect(content.countSessions).toHaveBeenCalledWith([CLIENT], '2026-10-05', '2026-10-11');
  });

  it('a client who never trained is quiet since joining', async () => {
    const { service, links } = setup();
    links.listActiveForTrainer.mockResolvedValue([row()]);
    const [out] = await service.listClients(TRAINER, '2026-10-08');
    expect(out).toMatchObject({ lastWorkoutDate: null, inactiveDays: 7, week: { sessions: 0 } });
  });

  it('flags "Routine changed by <client>" only when the CLIENT saved last, after the link started', async () => {
    const { service, links, content } = setup();
    links.listActiveForTrainer.mockResolvedValue([row()]);
    const changed = (lastEditedById: string | null, lastEditedAt: Date | null) =>
      content.activeRoutineStamps.mockResolvedValue(
        new Map([[CLIENT, { userId: CLIENT, lastEditedById, lastEditedAt }]]),
      );

    changed(CLIENT, new Date('2026-10-05T10:00:00Z'));
    expect((await service.listClients(TRAINER, '2026-10-07'))[0]?.routineChangedByClientAt).toBe(
      '2026-10-05T10:00:00.000Z',
    );
    changed(TRAINER, new Date('2026-10-05T10:00:00Z')); // the trainer saved last
    expect(
      (await service.listClients(TRAINER, '2026-10-07'))[0]?.routineChangedByClientAt,
    ).toBeNull();
    changed(CLIENT, new Date('2026-09-20T10:00:00Z')); // before the link started
    expect(
      (await service.listClients(TRAINER, '2026-10-07'))[0]?.routineChangedByClientAt,
    ).toBeNull();
    changed(null, new Date('2026-10-05T10:00:00Z')); // an editor whose account is gone
    expect(
      (await service.listClients(TRAINER, '2026-10-07'))[0]?.routineChangedByClientAt,
    ).toBeNull();
  });

  it('uses the weekly goal in force this week (goal history), not today’s profile value', async () => {
    const { service, links, content } = setup();
    links.listActiveForTrainer.mockResolvedValue([row()]);
    content.gymProfiles.mockResolvedValue(
      new Map([
        [
          CLIENT,
          profile({
            weeklyGoal: 4,
            goalHistory: [
              { fromWeek: '2026-08-31', goal: 2 },
              { fromWeek: '2026-10-05', goal: 4 },
            ] as never,
          }),
        ],
      ]),
    );
    expect((await service.listClients(TRAINER, '2026-10-07'))[0]?.week.goal).toBe(4);
    expect((await service.listClients(TRAINER, '2026-09-30'))[0]?.week.goal).toBe(2);
  });
});
