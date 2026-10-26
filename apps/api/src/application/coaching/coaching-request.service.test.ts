import { describe, expect, it, vi } from 'vitest';
import type { CoachingLink, CoachingRequest, TrainerProfile } from '@chefer/database';
import { COACHING_LIMITS, LEGAL_VERSIONS } from '@chefer/types';
import { CoachingRequestService } from './coaching-request.service.js';

// Find a trainer + coaching requests (PRD 2026-10 §4.1). The repository is
// faked; its transactions are proven in coaching.repository.db.test.ts.

const NOW = new Date('2026-10-17T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const CLIENT = 'cclient000000000000000001';
const MIHAI = 'ctrainer00000000000000001';
const ANA = 'ctrainer00000000000000002';
const BLOCKED = 'ctrainer00000000000000003';

const trainer = (userId: string, displayName: string): TrainerProfile => ({
  userId,
  displayName,
  gymLine: userId === MIHAI ? 'Iron Gym, Cluj' : null,
  activatedAt: NOW,
  disabledAt: null,
});

const link = (trainerId: string): CoachingLink => ({
  id: `l-${trainerId}`,
  trainerId,
  clientId: CLIENT,
  status: 'ACTIVE',
  inviteCode: null,
  requestId: null,
  trainerLabel: null,
  startedAt: NOW,
  startedOn: null,
  endedAt: null,
  endedBy: null,
  consentCopyVersion: 2,
  shareFoodAt: null,
  shareWeightAt: null,
});

const request = (over: Partial<CoachingRequest> = {}): CoachingRequest => ({
  id: 'req1',
  clientId: CLIENT,
  trainerId: MIHAI,
  status: 'PENDING',
  createdAt: NOW,
  expiresAt: new Date(NOW.getTime() + 14 * DAY),
  respondedAt: null,
  startedOn: '2026-10-17',
  shareFood: false,
  shareWeight: false,
  ...over,
});

function setup(
  opts: {
    current?: CoachingLink | null;
    pending?: CoachingRequest | null;
    gymDone?: boolean;
    clients?: number;
  } = {},
) {
  const profiles = new Map([
    [MIHAI, trainer(MIHAI, 'Mihai')],
    [ANA, trainer(ANA, 'Ana')],
    [BLOCKED, trainer(BLOCKED, 'Bogdan')],
  ]);
  const requests = {
    findLiveForClient: vi.fn(async () => opts.pending ?? null),
    listLiveForTrainer: vi.fn(async () => [
      { ...request(), client: { id: CLIENT, firstName: 'Ioana', lastName: 'M', name: null } },
    ]),
    create: vi.fn(async () => ({ status: 'created' as const, request: request() })),
    cancel: vi.fn(async () => request({ status: 'CANCELLED' })),
    decline: vi.fn(async () => request({ status: 'DECLINED' })),
    accept: vi.fn(async () => ({
      status: 'accepted' as const,
      request: request({ status: 'ACCEPTED' }),
      link: link(MIHAI),
      endedLinks: [link(ANA)],
    })),
    expireDue: vi.fn(),
    deleteAnsweredBefore: vi.fn(),
  };
  const trainers = {
    searchFindable: vi.fn(async () => [profiles.get(ANA)!, profiles.get(MIHAI)!]),
    findFindable: vi.fn(async (id: string) => profiles.get(id) ?? null),
    find: vi.fn(async (id: string) => profiles.get(id) ?? null),
    findMany: vi.fn(async (ids: string[]) => ids.flatMap((id) => profiles.get(id) ?? [])),
  };
  const links = {
    findActiveForClient: vi.fn(async () => opts.current ?? null),
    countActiveForTrainer: vi.fn(async () => opts.clients ?? 3),
    countActiveForTrainers: vi.fn(
      async () =>
        new Map([
          [MIHAI, COACHING_LIMITS.maxActiveClients],
          [ANA, 2],
        ]),
    ),
  };
  const notices = {
    requestReceived: vi.fn(),
    requestWithdrawn: vi.fn(),
    requestAnswered: vi.fn(),
    ended: vi.fn(),
  };
  const service = new CoachingRequestService({
    requests,
    trainers,
    links,
    blocks: { blockedIdsEither: vi.fn(async () => [BLOCKED]) },
    gymProfiles: {
      findByUserId: vi.fn(async () =>
        opts.gymDone === false ? null : ({ setupCompletedAt: NOW } as never),
      ),
    },
    notices,
    now: () => NOW,
  });
  return { service, requests, trainers, links, notices };
}

describe('findTrainers', () => {
  it('searches by name tokens, never the searcher or anyone blocked either way', async () => {
    const { service, trainers } = setup();
    const page = await service.findTrainers(CLIENT, { query: 'Ana Maria', limit: 20 });
    expect(trainers.searchFindable).toHaveBeenCalledWith(
      ['ana', 'maria'],
      [CLIENT, BLOCKED],
      expect.any(Number),
    );
    expect(page.items).toEqual([
      { trainerId: ANA, name: 'Ana', gymLine: null, acceptingClients: true },
      { trainerId: MIHAI, name: 'Mihai', gymLine: 'Iron Gym, Cluj', acceptingClients: false },
    ]);
    expect(page.nextCursor).toBeNull();
  });

  it('a query with no name tokens (an email is just punctuation) finds nothing without a query', async () => {
    const { service, trainers } = setup();
    expect(await service.findTrainers(CLIENT, { query: '@@', limit: 20 })).toEqual({
      items: [],
      nextCursor: null,
    });
    expect(trainers.searchFindable).not.toHaveBeenCalled();
  });

  it('pages with an offset cursor', async () => {
    const { service } = setup();
    const first = await service.findTrainers(CLIENT, { query: 'a', limit: 1 });
    expect(first.items.map((i) => i.name)).toEqual(['Ana']);
    const second = await service.findTrainers(CLIENT, {
      query: 'a',
      limit: 1,
      cursor: first.nextCursor ?? undefined,
    });
    expect(second.items.map((i) => i.name)).toEqual(['Mihai']);
    expect(second.nextCursor).toBeNull();
  });
});

describe('trainerCard', () => {
  it('a blocked, unknown or own profile is the same NOT_FOUND', async () => {
    const { service } = setup();
    for (const id of [BLOCKED, 'cnobody00000000000000001', CLIENT]) {
      await expect(service.trainerCard(CLIENT, id)).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'This trainer isn’t available',
      });
    }
  });

  it('names the current trainer (switch on accept) and a pending request elsewhere', async () => {
    const { service } = setup({ current: link(ANA), pending: request({ trainerId: ANA }) });
    expect(await service.trainerCard(CLIENT, MIHAI)).toEqual({
      trainerId: MIHAI,
      name: 'Mihai',
      gymLine: 'Iron Gym, Cluj',
      acceptingClients: true,
      relation: 'NONE',
      currentTrainerName: 'Ana',
      pendingRequestTo: 'Ana',
      needsGymSetup: false,
    });
  });

  it('relation: your trainer, or requested', async () => {
    expect(
      (await setup({ current: link(MIHAI) }).service.trainerCard(CLIENT, MIHAI)).relation,
    ).toBe('YOUR_TRAINER');
    expect((await setup({ pending: request() }).service.trainerCard(CLIENT, MIHAI)).relation).toBe(
      'REQUESTED',
    );
  });

  it('at 50 clients the profile is "Not taking new clients"', async () => {
    const card = await setup({ clients: COACHING_LIMITS.maxActiveClients }).service.trainerCard(
      CLIENT,
      MIHAI,
    );
    expect(card.acceptingClients).toBe(false);
  });
});

describe('request', () => {
  it('creates a 14-day request with the consent details and tells the trainer', async () => {
    const { service, requests, notices } = setup();
    const dto = await service.request(CLIENT, MIHAI, 'mobile', '2026-10-17');
    expect(requests.create).toHaveBeenCalledWith({
      clientId: CLIENT,
      trainerId: MIHAI,
      startedOn: '2026-10-17',
      expiresAt: new Date(NOW.getTime() + COACHING_LIMITS.requestTtlDays * DAY),
      source: 'mobile',
      documentVersion: `${LEGAL_VERSIONS.privacy}+coaching-v2`,
      now: NOW,
    });
    expect(notices.requestReceived).toHaveBeenCalledWith(MIHAI, CLIENT);
    expect(dto).toEqual({
      id: 'req1',
      trainer: { id: MIHAI, name: 'Mihai' },
      createdAt: NOW.toISOString(),
      expiresAt: new Date(NOW.getTime() + 14 * DAY).toISOString(),
    });
  });

  it.each([
    ['yourself', CLIENT, {}, 'BAD_REQUEST'],
    ['a blocked trainer', BLOCKED, {}, 'NOT_FOUND'],
    ['your own trainer', MIHAI, { current: link(MIHAI) }, 'BAD_REQUEST'],
    ['without gym setup', MIHAI, { gymDone: false }, 'PRECONDITION_FAILED'],
    [
      'a trainer at 50 clients',
      MIHAI,
      { clients: COACHING_LIMITS.maxActiveClients },
      'BAD_REQUEST',
    ],
  ] as const)('refuses %s', async (_label, trainerId, opts, code) => {
    const { service, requests } = setup(opts);
    await expect(service.request(CLIENT, trainerId, 'web')).rejects.toMatchObject({ code });
    expect(requests.create).not.toHaveBeenCalled();
  });

  it('one pending request at a time: the same trainer again is a no-op, anyone else a CONFLICT', async () => {
    const same = setup();
    same.requests.create.mockResolvedValueOnce({
      status: 'pending_exists',
      request: request(),
    } as never);
    await expect(same.service.request(CLIENT, MIHAI, 'web')).resolves.toMatchObject({ id: 'req1' });
    expect(same.notices.requestReceived).not.toHaveBeenCalled();

    const other = setup();
    other.requests.create.mockResolvedValueOnce({
      status: 'pending_exists',
      request: request({ trainerId: ANA }),
    } as never);
    await expect(other.service.request(CLIENT, MIHAI, 'web')).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('cancel withdraws the request from the trainer’s notices', async () => {
    const { service, notices } = setup();
    await expect(service.cancel(CLIENT, 'web')).resolves.toEqual({ ok: true });
    expect(notices.requestWithdrawn).toHaveBeenCalledWith(MIHAI, CLIENT);
  });
});

describe('accept / decline', () => {
  it('accept starts the coaching; the client hears it, the previous trainer hears the client left', async () => {
    const { service, requests, notices } = setup();
    await expect(service.accept(MIHAI, 'req1', 'web')).resolves.toEqual({
      ok: true,
      clientId: CLIENT,
    });
    expect(requests.accept).toHaveBeenCalledWith(
      expect.objectContaining({
        trainerId: MIHAI,
        requestId: 'req1',
        maxActiveClients: COACHING_LIMITS.maxActiveClients,
      }),
    );
    expect(notices.requestAnswered).toHaveBeenCalledWith(CLIENT, MIHAI, true);
    expect(notices.ended).toHaveBeenCalledWith(ANA, CLIENT, 'CLIENT', 'CLIENT');
  });

  it('a request that is not live (or not this trainer’s) is NOT_FOUND', async () => {
    const { service, requests } = setup();
    await expect(service.accept(MIHAI, 'nope', 'web')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(requests.accept).not.toHaveBeenCalled();
  });

  it('the 50-client cap holds on accept too', async () => {
    const { service, requests } = setup();
    requests.accept.mockResolvedValueOnce({ status: 'client_limit' } as never);
    await expect(service.accept(MIHAI, 'req1', 'web')).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('decline tells the client', async () => {
    const { service, notices } = setup();
    await service.decline(MIHAI, 'req1', 'web');
    expect(notices.requestAnswered).toHaveBeenCalledWith(CLIENT, MIHAI, false);
  });
});
