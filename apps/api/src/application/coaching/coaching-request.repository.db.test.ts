import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  coachingLinkRepository,
  coachingNoteRepository,
  coachingRequestRepository,
  prisma,
  trainerProfileRepository,
} from '@chefer/database';

// Real-database tests for coaching requests (PRD 2026-10 §4.1). OFF by default
// (CI has no database), like coaching.repository.db.test.ts. Run them against a
// database built with `prisma db push` + prisma/ensure-indexes.sql:
//   cd apps/api && COACHING_DB_TEST=1 DATABASE_URL=… npx vitest run src/application/coaching/coaching-request.repository.db
//
// What only a real database can prove: the one-PENDING-per-client partial
// unique index under a race, expiry inside the request transaction, and an
// accept that switches trainers in one transaction.

const enabled = process.env['COACHING_DB_TEST'] === '1';
const RUN = `dbreq${Date.now().toString(36)}`;
const PRIVACY = '2026-09-30';
const DAY = 86_400_000;

const created: string[] = [];
async function makeUser(label: string): Promise<string> {
  const user = await prisma.user.create({
    data: { email: `${RUN}-${label}@coaching.test`, firstName: label },
  });
  created.push(user.id);
  return user.id;
}

const ask = (clientId: string, trainerId: string, now = new Date()) =>
  coachingRequestRepository.create({
    clientId,
    trainerId,
    startedOn: '2026-10-17',
    expiresAt: new Date(now.getTime() + 14 * DAY),
    source: 'web',
    documentVersion: PRIVACY,
    now,
  });

const answer = (now = new Date()) => ({ source: 'web', documentVersion: PRIVACY, now });

const consents = (userId: string) =>
  prisma.consentEvent.findMany({
    where: { userId, kind: 'COACHING_SHARING' },
    orderBy: { createdAt: 'asc' },
  });

afterAll(async () => {
  if (!enabled) return;
  await prisma.user.deleteMany({ where: { id: { in: created } } });
  await prisma.$disconnect();
});

describe.skipIf(!enabled)('coaching requests (real database)', () => {
  let ana = '';
  let mihai = '';

  beforeAll(async () => {
    ana = await makeUser('ana');
    mihai = await makeUser('mihai');
    await trainerProfileRepository.activate(ana, 'Ana');
    await trainerProfileRepository.activate(mihai, 'Mihai', 'Iron Gym, Cluj');
  });

  it('two concurrent requests by one client leave exactly one PENDING row', async () => {
    const client = await makeUser('racer');
    const results = await Promise.all([ask(client, ana), ask(client, mihai)]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses.filter((s) => s === 'created')).toHaveLength(1);
    expect(
      await prisma.coachingRequest.count({ where: { clientId: client, status: 'PENDING' } }),
    ).toBe(1);
  });

  it('sending records the consent; cancelling withdraws it on the same request id', async () => {
    const client = await makeUser('canceller');
    const created = await ask(client, ana);
    if (created.status !== 'created') throw new Error(created.status);
    const cancelled = await coachingRequestRepository.cancel(client, answer());
    expect(cancelled?.id).toBe(created.request.id);
    const events = await consents(client);
    expect(events.map((e) => [e.granted, e.contextId])).toEqual([
      [true, created.request.id],
      [false, created.request.id],
    ]);
    // A request never creates a follow.
    expect(
      await prisma.follow.count({
        where: { OR: [{ followerId: client }, { followeeId: client }] },
      }),
    ).toBe(0);
  });

  it('an expired PENDING row is flipped (with its withdrawal) before the next request', async () => {
    const client = await makeUser('late');
    const longAgo = new Date(Date.now() - 20 * DAY);
    const old = await ask(client, ana, longAgo);
    if (old.status !== 'created') throw new Error(old.status);
    expect(await coachingRequestRepository.findLiveForClient(client, new Date())).toBeNull();
    const fresh = await ask(client, mihai);
    expect(fresh.status).toBe('created');
    const stale = await prisma.coachingRequest.findUnique({ where: { id: old.request.id } });
    expect(stale?.status).toBe('EXPIRED');
  });

  it('accept switches trainers in one transaction: old coaching ended, note back for a reconnecting pair', async () => {
    const client = await makeUser('switcher');
    // Coached by Ana first (through an earlier accepted request).
    const first = await ask(client, ana);
    if (first.status !== 'created') throw new Error(first.status);
    const a1 = await coachingRequestRepository.accept({
      trainerId: ana,
      requestId: first.request.id,
      maxActiveClients: 50,
      startedOn: null,
      ...answer(),
    });
    expect(a1.status).toBe('accepted');
    await coachingNoteRepository.upsert(ana, client, 'likes mornings');

    // Then asks Mihai; Mihai accepts: Ana's coaching ends in the same transaction.
    const second = await ask(client, mihai);
    if (second.status !== 'created') throw new Error(second.status);
    const a2 = await coachingRequestRepository.accept({
      trainerId: mihai,
      requestId: second.request.id,
      maxActiveClients: 50,
      startedOn: null,
      ...answer(),
    });
    expect(a2.status).toBe('accepted');
    if (a2.status !== 'accepted') return;
    expect(a2.endedLinks.map((l) => l.trainerId)).toEqual([ana]);
    expect(a2.link).toMatchObject({
      trainerId: mihai,
      requestId: second.request.id,
      startedOn: '2026-10-17',
    });
    expect((await coachingLinkRepository.findActiveForClient(client))?.trainerId).toBe(mihai);
    const hidden = await prisma.coachingNote.findUnique({
      where: { trainerId_clientId: { trainerId: ana, clientId: client } },
    });
    expect(hidden?.hiddenAt).not.toBeNull();

    // A second accept of the same request is not available any more.
    const again = await coachingRequestRepository.accept({
      trainerId: mihai,
      requestId: second.request.id,
      maxActiveClients: 50,
      startedOn: null,
      ...answer(),
    });
    expect(again.status).toBe('unavailable');
  });

  it('accept honours the client cap', async () => {
    const client = await makeUser('capped');
    const req = await ask(client, ana);
    if (req.status !== 'created') throw new Error(req.status);
    const res = await coachingRequestRepository.accept({
      trainerId: ana,
      requestId: req.request.id,
      maxActiveClients: 0,
      startedOn: null,
      ...answer(),
    });
    expect(res.status).toBe('client_limit');
    expect(
      (await prisma.coachingRequest.findUnique({ where: { id: req.request.id } }))?.status,
    ).toBe('PENDING');
  });

  it('a trainer who stops declines their pending requests; findable needs Following on', async () => {
    const trainer = await makeUser('stopper');
    await trainerProfileRepository.activate(trainer, 'Stop');
    expect(await trainerProfileRepository.findFindable(trainer)).toBeNull();
    await prisma.socialProfile.create({ data: { userId: trainer, searchName: 'stopper' } });
    expect(await trainerProfileRepository.findFindable(trainer)).not.toBeNull();
    expect(
      (await trainerProfileRepository.searchFindable(['stop'], [], 10)).map((t) => t.userId),
    ).toContain(trainer);

    const client = await makeUser('waiting');
    await ask(client, trainer);
    const res = await trainerProfileRepository.deactivate(trainer, answer());
    expect(res.declinedClientIds).toEqual([client]);
    expect(await coachingRequestRepository.findLiveForClient(client, new Date())).toBeNull();
    expect(await trainerProfileRepository.findFindable(trainer)).toBeNull();
  });
});
