import { describe, expect, it, vi } from 'vitest';
import type {
  BookingClient,
  BookingEditPlan,
  BookingWithClients,
  CreateBookingsData,
} from '@chefer/database';
import { BOOKING_COPY, COACHING_COPY, type CreateBookingInput } from '@chefer/types';
import { utcToZoned, zonedToUtc } from '@chefer/utils';
import { ConflictCause } from '../../lib/conflict.js';
import { BookingService, clientChanges, toClientBookingDto } from './booking.service.js';

// trainer.bookings.* / coaching.bookings.* (trainer-mode.md §6.2–§6.4, §8.2, §9):
// weekly repeats materialised in the booking's zone (DST keeps 18:00), series
// split on "this and following", the version check, the past / horizon /
// clients rules, and who gets which notice. The repository is an in-memory fake.

// The default singletons reach lib/env.js; the unit-test job has no env.
vi.mock('./workout-template.service.js', () => ({ workoutTemplateService: {} }));
vi.mock('./coaching-notice.service.js', () => ({ coachingNoticeService: {} }));

const TRAINER = 'ctrainer0000000000000001';
const MARIA = 'cmaria000000000000000001';
const ION = 'cion00000000000000000001';
const FORMER = 'cformer00000000000000001';
const ZONE = 'Europe/Bucharest';
/** Monday 19 Oct 2026, 09:00 UTC (12:00 in Bucharest, summer time until the 25th). */
const NOW = new Date('2026-10-19T09:00:00Z');

let seq = 0;
function booking(over: Partial<BookingWithClients> = {}): BookingWithClients {
  seq += 1;
  return {
    id: `b${seq}`,
    trainerId: TRAINER,
    seriesId: null,
    kind: 'BOOKING',
    startsAt: zonedToUtc('2026-10-20', '18:00', ZONE),
    durationMin: 60,
    timeZone: ZONE,
    location: null,
    note: null,
    cancelledAt: null,
    cancelReason: null,
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
    clients: [place(MARIA)],
    ...over,
  };
}

function place(clientId: string, over: Partial<BookingClient> = {}): BookingClient {
  return {
    bookingId: 'x',
    clientId,
    workoutRef: null,
    attendance: 'SCHEDULED',
    attendanceAt: null,
    workoutSessionId: null,
    ...over,
  };
}

function setup(rows: BookingWithClients[] = []) {
  const store = new Map(rows.map((r) => [r.id, r]));
  const bookings = {
    find: vi.fn(async (_t: string, id: string) => store.get(id) ?? null),
    findForClient: vi.fn(async (clientId: string, id: string) => {
      const r = store.get(id);
      return r?.clients.some((c) => c.clientId === clientId) ? r : null;
    }),
    listOverlapping: vi.fn(async () => [...store.values()]),
    listForPair: vi.fn(async (_t: string, clientId: string) =>
      [...store.values()].filter((r) => r.clients.some((c) => c.clientId === clientId)),
    ),
    listSeries: vi.fn(async (seriesId: string) =>
      [...store.values()]
        .filter((r) => r.seriesId === seriesId)
        .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()),
    ),
    findSeries: vi.fn(),
    nextStartsByClient: vi.fn(),
    createMany: vi.fn(async (data: CreateBookingsData) =>
      data.occurrences.map((o, i) =>
        booking({
          id: `new${i}`,
          kind: data.kind,
          seriesId: data.series ? 's-new' : null,
          ...o,
          clients: data.clients.map((c) =>
            place(c.clientId, { workoutRef: c.workoutRef as BookingClient['workoutRef'] }),
          ),
        }),
      ),
    ),
    applyPlan: vi.fn(async (_plan: BookingEditPlan) => ({ status: 'ok' as const })),
    setAttendance: vi.fn(async () => true),
    routineDayNames: vi.fn(async () => new Map([['day-b', 'Lower body A']])),
    listForExport: vi.fn(),
    cancelFutureForClient: vi.fn(),
    deleteForEndedLinksBefore: vi.fn(),
    deleteBlocksBefore: vi.fn(),
  };
  const active = [
    { clientId: MARIA, client: { id: MARIA, firstName: 'Maria', lastName: null, name: null } },
    { clientId: ION, client: { id: ION, firstName: 'Ion', lastName: null, name: null } },
  ];
  const links = {
    listActiveForTrainer: vi.fn(async () => active as never),
    findActiveForClient: vi.fn(async (clientId: string) =>
      clientId === FORMER ? null : ({ trainerId: TRAINER, clientId } as never),
    ),
  };
  const routines = {
    findActive: vi.fn(async () => ({ days: [{ id: 'day-a' }, { id: 'day-b' }] }) as never),
  };
  const templates = {
    assign: vi.fn(async () => ({
      templateId: 'tpl',
      templateVersion: 1,
      results: [{ clientId: MARIA, ok: true as const, routineDayId: 'day-new' }],
    })),
  };
  const notices = { booking: vi.fn(async () => undefined) };
  const trainers = { find: vi.fn(async () => ({ displayName: 'Ana' }) as never) };
  const service = new BookingService({
    bookings,
    links,
    routines,
    trainers,
    templates,
    notices,
    now: () => NOW,
  });
  return { service, bookings, notices, templates, store };
}

const create = (over: Partial<CreateBookingInput> = {}): CreateBookingInput => ({
  kind: 'BOOKING',
  date: '2026-10-20',
  time: '18:00',
  timeZone: ZONE,
  durationMin: 60,
  clients: [{ clientId: MARIA }],
  ...over,
});

async function rejection(p: Promise<unknown>) {
  try {
    await p;
  } catch (err) {
    return err as { code: string; message: string; cause?: unknown };
  }
  throw new Error('expected a rejection');
}

describe('create: repeat materialisation', () => {
  it('a one-off booking is one row with no series', async () => {
    const { service, bookings } = setup();
    const dto = await service.create(TRAINER, create());
    const data = bookings.createMany.mock.calls[0]?.[0];
    expect(data?.series).toBeNull();
    expect(data?.occurrences).toHaveLength(1);
    expect(dto.startsAt).toBe('2026-10-20T15:00:00.000Z');
    expect(dto.endsAt).toBe('2026-10-20T16:00:00.000Z');
  });

  it('weekly with no end date: 12 occurrences, the series row carries the weekday and the last date', async () => {
    const { service, bookings } = setup();
    await service.create(TRAINER, create({ repeat: { rule: 'WEEKLY' } }));
    const data = bookings.createMany.mock.calls[0]?.[0];
    expect(data?.occurrences).toHaveLength(12);
    expect(data?.series).toEqual({
      weekday: 1, // Tuesday
      startLocalTime: '18:00',
      durationMin: 60,
      timeZone: ZONE,
      startsOn: '2026-10-20',
      endsOn: '2027-01-05',
    });
  });

  it('DST: a weekly 18:00 made on 20 Oct in Bucharest stays 18:00 local on 27 Oct (16:00 UTC)', async () => {
    const { service, bookings } = setup();
    await service.create(TRAINER, create({ repeat: { rule: 'WEEKLY', until: '2026-10-27' } }));
    const occ = bookings.createMany.mock.calls[0]?.[0].occurrences ?? [];
    expect(occ.map((o) => o.startsAt.toISOString())).toEqual([
      '2026-10-20T15:00:00.000Z', // EEST, UTC+3
      '2026-10-27T16:00:00.000Z', // EET, UTC+2
    ]);
    expect(occ.map((o) => utcToZoned(o.startsAt, ZONE).time)).toEqual(['18:00', '18:00']);
  });

  it('until is inclusive and at most 52 weeks; before the first date is rejected', async () => {
    const { service, bookings } = setup();
    await service.create(TRAINER, create({ repeat: { rule: 'WEEKLY', until: '2027-10-12' } }));
    expect(bookings.createMany.mock.calls[0]?.[0].occurrences).toHaveLength(52);
    expect(
      (
        await rejection(
          service.create(TRAINER, create({ repeat: { rule: 'WEEKLY', until: '2027-10-19' } })),
        )
      ).code,
    ).toBe('BAD_REQUEST');
    expect(
      (
        await rejection(
          service.create(TRAINER, create({ repeat: { rule: 'WEEKLY', until: '2026-10-13' } })),
        )
      ).code,
    ).toBe('BAD_REQUEST');
  });

  it('the past, beyond 365 days, or an unknown zone is a BAD_REQUEST and writes nothing', async () => {
    const { service, bookings } = setup();
    const past = await rejection(service.create(TRAINER, create({ date: '2026-10-18' })));
    expect(past).toMatchObject({ code: 'BAD_REQUEST', message: BOOKING_COPY.server.past });
    const far = await rejection(service.create(TRAINER, create({ date: '2027-10-21' })));
    expect(far).toMatchObject({ code: 'BAD_REQUEST', message: BOOKING_COPY.server.horizon(365) });
    const zone = await rejection(service.create(TRAINER, create({ timeZone: 'Mars/Olympus' })));
    expect(zone).toMatchObject({ code: 'BAD_REQUEST', message: BOOKING_COPY.server.badZone });
    expect(bookings.createMany).not.toHaveBeenCalled();
  });

  it('a slot that started a minute ago is still "now" (5 minutes of grace)', async () => {
    const { service, bookings } = setup();
    await service.create(TRAINER, create({ date: '2026-10-19', time: '11:55' }));
    expect(bookings.createMany).toHaveBeenCalled();
  });
});

describe('create: clients', () => {
  it('a non-client is the single NOT_FOUND, before anything is written', async () => {
    const { service, bookings, templates } = setup();
    const err = await rejection(
      service.create(
        TRAINER,
        create({
          clients: [
            { clientId: MARIA, workout: { kind: 'TEMPLATE', templateId: 'tpl' } },
            { clientId: FORMER },
          ],
        }),
      ),
    );
    expect(err).toMatchObject({
      code: 'NOT_FOUND',
      message: COACHING_COPY.server.clientUnavailable,
    });
    expect(templates.assign).not.toHaveBeenCalled();
    expect(bookings.createMany).not.toHaveBeenCalled();
  });

  it('the same client twice is a BAD_REQUEST', async () => {
    const { service } = setup();
    expect(
      (
        await rejection(
          service.create(TRAINER, create({ clients: [{ clientId: MARIA }, { clientId: MARIA }] })),
        )
      ).code,
    ).toBe('BAD_REQUEST');
  });

  it('a TEMPLATE is assigned as a new day and stored as that ROUTINE_DAY', async () => {
    const { service, bookings, templates } = setup();
    await service.create(
      TRAINER,
      create({ clients: [{ clientId: MARIA, workout: { kind: 'TEMPLATE', templateId: 'tpl' } }] }),
    );
    expect(templates.assign).toHaveBeenCalledWith(TRAINER, {
      templateId: 'tpl',
      targets: [{ clientId: MARIA, mode: 'ADD_DAY' }],
    });
    expect(bookings.createMany.mock.calls[0]?.[0].clients).toEqual([
      { clientId: MARIA, workoutRef: { kind: 'ROUTINE_DAY', routineDayId: 'day-new' } },
    ]);
  });

  it('a ROUTINE_DAY not in the client’s active routine is rejected', async () => {
    const { service } = setup();
    const err = await rejection(
      service.create(
        TRAINER,
        create({
          clients: [
            { clientId: MARIA, workout: { kind: 'ROUTINE_DAY', routineDayId: 'elsewhere' } },
          ],
        }),
      ),
    );
    expect(err.code).toBe('BAD_REQUEST');
  });

  it('one BOOKING_CREATED per client for a whole series', async () => {
    const { service, notices } = setup();
    await service.create(
      TRAINER,
      create({ clients: [{ clientId: MARIA }, { clientId: ION }], repeat: { rule: 'WEEKLY' } }),
    );
    expect(notices.booking).toHaveBeenCalledTimes(2);
    expect(notices.booking).toHaveBeenCalledWith(
      MARIA,
      TRAINER,
      'CREATED',
      expect.objectContaining({ bookingId: 'new0', weekly: true, reason: null }),
    );
  });
});

describe('update', () => {
  it('a stale version is CONFLICT carrying the booking as stored now', async () => {
    const b = booking({ version: 3 });
    const { service, bookings } = setup([b]);
    const err = await rejection(
      service.update(TRAINER, {
        bookingId: b.id,
        expectedVersion: 2,
        scope: 'THIS',
        patch: { time: '19:00' },
      }),
    );
    expect(err.code).toBe('CONFLICT');
    expect(err.cause).toBeInstanceOf(ConflictCause);
    expect((err.cause as ConflictCause).payload).toMatchObject({
      kind: 'booking',
      current: { id: b.id, version: 3 },
    });
    expect(bookings.applyPlan).not.toHaveBeenCalled();
  });

  it('a booking that already started cannot be edited', async () => {
    const b = booking({ startsAt: new Date('2026-10-19T08:30:00Z') });
    const { service } = setup([b]);
    const err = await rejection(
      service.update(TRAINER, { bookingId: b.id, expectedVersion: 1, scope: 'THIS', patch: {} }),
    );
    expect(err).toMatchObject({ code: 'BAD_REQUEST', message: BOOKING_COPY.server.past });
  });

  it('THIS on a series occurrence changes that row only', async () => {
    const rows = ['2026-10-20', '2026-10-27'].map((d) =>
      booking({ seriesId: 's1', startsAt: zonedToUtc(d, '18:00', ZONE) }),
    );
    const { service, bookings } = setup(rows);
    await service.update(TRAINER, {
      bookingId: rows[1]!.id,
      expectedVersion: 1,
      scope: 'THIS',
      patch: { durationMin: 45 },
    });
    const plan = bookings.applyPlan.mock.calls[0]?.[0];
    expect(plan?.rows).toEqual([{ id: rows[1]!.id, data: { durationMin: 45 } }]);
    expect(plan?.createSeries).toBeUndefined();
  });

  it('FOLLOWING from the 2nd of 4 splits: the old series ends at the 1st, the rest move to a new one', async () => {
    const dates = ['2026-10-20', '2026-10-27', '2026-11-03', '2026-11-10'];
    const rows = dates.map((d) =>
      booking({ seriesId: 's1', startsAt: zonedToUtc(d, '18:00', ZONE) }),
    );
    const { service, bookings } = setup(rows);
    await service.update(TRAINER, {
      bookingId: rows[1]!.id,
      expectedVersion: 1,
      scope: 'FOLLOWING',
      patch: { time: '07:00', date: '2026-10-28' },
    });
    const plan = bookings.applyPlan.mock.calls[0]?.[0];
    expect(plan?.endSeries).toEqual({ id: 's1', endsOn: '2026-10-20' });
    expect(plan?.createSeries).toEqual({
      weekday: 2, // moved to Wednesdays
      startLocalTime: '07:00',
      durationMin: 60,
      timeZone: ZONE,
      startsOn: '2026-10-28',
      endsOn: '2026-11-11',
    });
    expect(plan?.rows.map((r) => r.id)).toEqual(rows.slice(1).map((r) => r.id));
    expect(plan?.rows.every((r) => r.toNewSeries)).toBe(true);
    expect(plan?.rows.map((r) => r.data?.startsAt?.toISOString())).toEqual([
      zonedToUtc('2026-10-28', '07:00', ZONE).toISOString(),
      zonedToUtc('2026-11-04', '07:00', ZONE).toISOString(),
      zonedToUtc('2026-11-11', '07:00', ZONE).toISOString(),
    ]);
  });

  it('FOLLOWING from the first occurrence rewrites the series in place (no split)', async () => {
    const rows = ['2026-10-20', '2026-10-27'].map((d) =>
      booking({ seriesId: 's1', startsAt: zonedToUtc(d, '18:00', ZONE) }),
    );
    const { service, bookings } = setup(rows);
    await service.update(TRAINER, {
      bookingId: rows[0]!.id,
      expectedVersion: 1,
      scope: 'FOLLOWING',
      patch: { location: 'Studio 2' },
    });
    const plan = bookings.applyPlan.mock.calls[0]?.[0];
    expect(plan?.updateSeries?.id).toBe('s1');
    expect(plan?.endSeries).toBeUndefined();
    expect(plan?.rows.map((r) => r.data)).toEqual([
      { location: 'Studio 2' },
      { location: 'Studio 2' },
    ]);
  });

  it('a lost race in the transaction is CONFLICT too', async () => {
    const b = booking();
    const { service, bookings } = setup([b]);
    bookings.applyPlan.mockResolvedValueOnce({ status: 'conflict' } as never);
    const err = await rejection(
      service.update(TRAINER, { bookingId: b.id, expectedVersion: 1, scope: 'THIS', patch: {} }),
    );
    expect(err.code).toBe('CONFLICT');
  });

  it('notices: added CREATED, removed CANCELLED, kept CHANGED only when something they see changed', () => {
    const before = booking({ clients: [place(MARIA), place(ION)] });
    expect(
      clientChanges(
        before,
        [
          { clientId: MARIA, workoutRef: null },
          { clientId: FORMER, workoutRef: null },
        ],
        {
          visibleChange: false,
        },
      ),
    ).toEqual([
      { clientId: FORMER, change: 'CREATED' },
      { clientId: ION, change: 'CANCELLED' },
    ]);
    expect(clientChanges(before, undefined, { visibleChange: true })).toEqual([
      { clientId: MARIA, change: 'CHANGED' },
      { clientId: ION, change: 'CHANGED' },
    ]);
    expect(clientChanges(before, undefined, { visibleChange: false })).toEqual([]);
  });
});

describe('cancel', () => {
  it('FOLLOWING cancels this and the later live occurrences, ends the series, and tells each client once', async () => {
    const dates = ['2026-10-20', '2026-10-27', '2026-11-03', '2026-11-10'];
    const rows = dates.map((d) =>
      booking({
        seriesId: 's1',
        startsAt: zonedToUtc(d, '18:00', ZONE),
        clients: [place(MARIA), place(ION)],
      }),
    );
    rows[3] = { ...rows[3]!, cancelledAt: NOW };
    const { service, bookings, notices } = setup(rows);
    const res = await service.cancel(TRAINER, {
      bookingId: rows[1]!.id,
      scope: 'FOLLOWING',
      reason: ' Away ',
    });
    expect(res).toEqual({ ok: true, cancelled: 2 });
    const plan = bookings.applyPlan.mock.calls[0]?.[0];
    expect(plan?.rows).toEqual([
      { id: rows[1]!.id, cancel: { at: NOW, reason: 'Away' } },
      { id: rows[2]!.id, cancel: { at: NOW, reason: 'Away' } },
    ]);
    expect(plan?.endSeries).toEqual({ id: 's1', endsOn: '2026-10-20' });
    expect(notices.booking).toHaveBeenCalledTimes(2);
    expect(notices.booking).toHaveBeenCalledWith(
      MARIA,
      TRAINER,
      'CANCELLED',
      expect.objectContaining({ bookingId: rows[1]!.id, weekly: true, reason: 'Away' }),
    );
  });

  it('an already cancelled booking is a no-op; a started one cannot be cancelled', async () => {
    const done = booking({ cancelledAt: NOW });
    const started = booking({ startsAt: new Date('2026-10-19T08:45:00Z') });
    const { service, bookings } = setup([done, started]);
    expect(await service.cancel(TRAINER, { bookingId: done.id, scope: 'THIS' })).toEqual({
      ok: true,
      cancelled: 0,
    });
    expect(
      (await rejection(service.cancel(TRAINER, { bookingId: started.id, scope: 'THIS' }))).code,
    ).toBe('BAD_REQUEST');
    expect(bookings.applyPlan).not.toHaveBeenCalled();
  });
});

describe('attendance and visibility', () => {
  it('markAttendance opens 15 minutes before the start; SCHEDULED clears the mark', async () => {
    const tooEarly = booking({ startsAt: new Date('2026-10-19T09:20:00Z') });
    const open = booking({ startsAt: new Date('2026-10-19T09:10:00Z') });
    const { service, bookings } = setup([tooEarly, open]);
    const err = await rejection(
      service.markAttendance(TRAINER, {
        bookingId: tooEarly.id,
        clientId: MARIA,
        attendance: 'ATTENDED',
      }),
    );
    expect(err).toMatchObject({
      code: 'BAD_REQUEST',
      message: BOOKING_COPY.detail.startAvailable(15),
    });
    await service.markAttendance(TRAINER, {
      bookingId: open.id,
      clientId: MARIA,
      attendance: 'NO_SHOW',
    });
    expect(bookings.setAttendance).toHaveBeenLastCalledWith({
      bookingId: open.id,
      clientId: MARIA,
      attendance: 'NO_SHOW',
      at: NOW,
    });
    await service.markAttendance(TRAINER, {
      bookingId: open.id,
      clientId: MARIA,
      attendance: 'SCHEDULED',
    });
    expect(bookings.setAttendance).toHaveBeenLastCalledWith(expect.objectContaining({ at: null }));
  });

  it('a former client is left out; a booking with only former clients is not found', async () => {
    const group = booking({ clients: [place(MARIA), place(FORMER)] });
    const orphan = booking({ clients: [place(FORMER)] });
    const block = booking({ kind: 'BLOCK', clients: [] });
    const { service } = setup([group, orphan, block]);
    const range = await service.range(TRAINER, NOW, new Date('2026-10-26T00:00:00Z'));
    expect(range.bookings.map((b) => b.id)).toEqual([group.id, block.id]);
    expect(range.bookings[0]?.clients.map((c) => c.clientId)).toEqual([MARIA]);
    expect((await rejection(service.get(TRAINER, orphan.id))).code).toBe('NOT_FOUND');
  });

  it('the client view counts the others and never names them', () => {
    const b = booking({
      clients: [
        place(MARIA, { workoutRef: { kind: 'ROUTINE_DAY', routineDayId: 'day-b' } }),
        place(ION),
        place(FORMER, { attendance: 'CANCELLED' }),
      ],
    });
    const dto = toClientBookingDto(b, MARIA, 'Ana', new Map([['day-b', 'Lower body A']]));
    expect(dto).toMatchObject({
      otherClients: 1,
      workoutName: 'Lower body A',
      trainer: { name: 'Ana' },
    });
    expect(JSON.stringify(dto)).not.toContain(ION);
  });

  it('coaching.bookings.upcoming: current trainer only; a cancelled one stays until it starts', async () => {
    const live = booking();
    const cancelled = booking({ cancelledAt: NOW, cancelReason: 'Sick' });
    const cancelledStarted = booking({
      cancelledAt: NOW,
      startsAt: new Date('2026-10-19T08:30:00Z'),
    });
    const { service } = setup([live, cancelled, cancelledStarted]);
    const list = await service.upcomingForClient(MARIA);
    expect(list.map((b) => b.id)).toEqual([live.id, cancelled.id]);
    expect(list[1]).toMatchObject({ cancelReason: 'Sick' });
    expect(await service.upcomingForClient(FORMER)).toEqual([]);
  });

  it('coaching.bookings.get: NOT_FOUND unless the caller has a place in it', async () => {
    const b = booking();
    const { service } = setup([b]);
    expect((await service.getForClient(MARIA, b.id)).id).toBe(b.id);
    expect((await rejection(service.getForClient(ION, b.id))).code).toBe('NOT_FOUND');
  });
});
