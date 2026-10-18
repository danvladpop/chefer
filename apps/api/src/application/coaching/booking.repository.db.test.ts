import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  bookingRepository,
  coachingLinkRepository,
  prisma,
  workoutSessionRepository,
} from '@chefer/database';

// Real-database tests for trainer mode bookings (trainer-mode.md §8.2, §9, §10).
// OFF by default (CI has no database). Run them with:
//   cd apps/api && COACHING_DB_TEST=1 npx vitest run src/application/coaching/booking.repository.db
//
// What only a real database can prove: coaching ending cancels the client's
// FUTURE bookings inside the end transaction (past ones and the other clients'
// places stay), the version guard of a plan, retention, and that a coached
// write can never overwrite a workout the client logged.

const enabled = process.env['COACHING_DB_TEST'] === '1';
const RUN = `bkdb${Date.now().toString(36)}`;
const created: string[] = [];
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

async function makeUser(label: string): Promise<string> {
  const user = await prisma.user.create({
    data: { email: `${RUN}-${label}@bookings.test`, firstName: label },
  });
  created.push(user.id);
  return user.id;
}

async function link(trainerId: string, clientId: string) {
  return prisma.coachingLink.create({
    data: { trainerId, clientId, startedAt: new Date(Date.now() - 60 * DAY) },
  });
}

function one(trainerId: string, startsAt: Date, clientIds: string[]) {
  return bookingRepository.createMany({
    trainerId,
    kind: clientIds.length > 0 ? 'BOOKING' : 'BLOCK',
    series: null,
    occurrences: [
      { startsAt, durationMin: 60, timeZone: 'Europe/Bucharest', location: null, note: null },
    ],
    clients: clientIds.map((clientId) => ({ clientId, workoutRef: null })),
  });
}

afterAll(async () => {
  if (!enabled) return;
  await prisma.booking.deleteMany({ where: { trainerId: { in: created } } });
  await prisma.user.deleteMany({ where: { id: { in: created } } });
  await prisma.$disconnect();
});

describe.skipIf(!enabled)('bookings (real database)', () => {
  let trainer = '';
  let maria = '';
  let ion = '';

  beforeAll(async () => {
    trainer = await makeUser('trainer');
    maria = await makeUser('maria');
    ion = await makeUser('ion');
    await prisma.trainerProfile.create({ data: { userId: trainer, displayName: 'Ana' } });
    await link(trainer, maria);
    await link(trainer, ion);
  });

  it('coaching ended → future bookings cancelled for that client; past ones and the others stay', async () => {
    const now = Date.now();
    const [past] = await one(trainer, new Date(now - 2 * DAY), [maria]);
    const [solo] = await one(trainer, new Date(now + 2 * DAY), [maria]);
    const [group] = await one(trainer, new Date(now + 3 * DAY), [maria, ion]);
    const [block] = await one(trainer, new Date(now + 4 * DAY), []);

    const ended = await coachingLinkRepository.end({
      trainerId: trainer,
      clientId: maria,
      endedBy: 'CLIENT',
      source: 'web',
      documentVersion: 'test',
      now: new Date(now),
    });
    expect(ended).not.toBeNull();

    const read = async (id: string | undefined) => {
      const row = await bookingRepository.find(trainer, id ?? '');
      if (!row) throw new Error('missing');
      return row;
    };
    const pastRow = await read(past?.id);
    expect(pastRow.cancelledAt).toBeNull();
    expect(pastRow.clients[0]?.attendance).toBe('SCHEDULED');

    const soloRow = await read(solo?.id);
    expect(soloRow.cancelledAt).not.toBeNull();
    expect(soloRow.clients[0]?.attendance).toBe('CANCELLED');

    const groupRow = await read(group?.id);
    expect(groupRow.cancelledAt).toBeNull();
    expect(groupRow.clients.find((c) => c.clientId === maria)?.attendance).toBe('CANCELLED');
    expect(groupRow.clients.find((c) => c.clientId === ion)?.attendance).toBe('SCHEDULED');
    expect(groupRow.version).toBe(2);

    expect((await read(block?.id)).cancelledAt).toBeNull();
  });

  it('a plan is guarded by the opened version', async () => {
    const [b] = await one(trainer, new Date(Date.now() + 5 * DAY), [ion]);
    if (!b) throw new Error('fixture');
    const ok = await bookingRepository.applyPlan({
      trainerId: trainer,
      guard: { bookingId: b.id, version: 1 },
      rows: [{ id: b.id, data: { durationMin: 45 } }],
    });
    expect(ok).toEqual({ status: 'ok' });
    const stale = await bookingRepository.applyPlan({
      trainerId: trainer,
      guard: { bookingId: b.id, version: 1 },
      rows: [{ id: b.id, data: { durationMin: 30 } }],
    });
    expect(stale).toEqual({ status: 'conflict' });
    const row = await bookingRepository.find(trainer, b.id);
    expect(row).toMatchObject({ durationMin: 45, version: 2 });
    // Another trainer's booking is not_found, never touched.
    expect(
      await bookingRepository.applyPlan({
        trainerId: maria,
        guard: { bookingId: b.id, version: 2 },
        rows: [],
      }),
    ).toEqual({ status: 'not_found' });
  });

  it('retention: places of links ended 24+ months ago go, then empty bookings; old blocked time goes', async () => {
    const oldTrainer = await makeUser('old-trainer');
    const oldClient = await makeUser('old-client');
    const longAgo = new Date(Date.now() - 800 * DAY);
    await prisma.coachingLink.create({
      data: {
        trainerId: oldTrainer,
        clientId: oldClient,
        startedAt: new Date(longAgo.getTime() - 30 * DAY),
        status: 'ENDED',
        endedAt: longAgo,
        endedBy: 'CLIENT',
      },
    });
    const [oldBooking] = await one(oldTrainer, new Date(longAgo.getTime() - 2 * DAY), [oldClient]);
    const [oldBlock] = await one(oldTrainer, new Date(longAgo.getTime() - 2 * DAY), []);
    const cutoff = new Date(Date.now() - 730 * DAY);
    expect(await bookingRepository.deleteForEndedLinksBefore(cutoff)).toBeGreaterThanOrEqual(2);
    expect(await bookingRepository.deleteBlocksBefore(cutoff)).toBeGreaterThanOrEqual(1);
    expect(
      await prisma.booking.count({
        where: { id: { in: [oldBooking?.id ?? '', oldBlock?.id ?? ''] } },
      }),
    ).toBe(0);
  });

  it('a coached write never overwrites a workout the client logged', async () => {
    const id = crypto.randomUUID();
    const base = {
      id,
      routineId: null,
      routineDayId: null,
      name: 'Own',
      status: 'COMPLETED' as const,
      startedAt: new Date(Date.now() - HOUR),
      finishedAt: new Date(),
      localDate: '2026-10-19',
      isDeload: false,
      notes: null,
      clientUpdatedAt: new Date(Date.now() - HOUR),
      engineVersion: 1,
      workoutType: null,
      exercises: [],
    };
    expect(
      (await workoutSessionRepository.upsertDocument(ion, base, { rotation: null })).status,
    ).toBe('written');
    const coached = await workoutSessionRepository.upsertDocument(
      ion,
      { ...base, clientUpdatedAt: new Date() },
      { rotation: null, coached: { loggedById: trainer, bookingId: null } },
    );
    expect(coached.status).toBe('foreign');
    // A coached workout keeps its stamp when the client later edits it.
    const coachedId = crypto.randomUUID();
    await workoutSessionRepository.upsertDocument(
      ion,
      { ...base, id: coachedId },
      { rotation: null, coached: { loggedById: trainer, bookingId: null } },
    );
    await workoutSessionRepository.upsertDocument(
      ion,
      { ...base, id: coachedId, clientUpdatedAt: new Date(), name: 'Edited' },
      { rotation: null },
    );
    const row = await prisma.workoutSession.findUnique({ where: { id: coachedId } });
    expect(row).toMatchObject({ name: 'Edited', loggedById: trainer });
  });
});
