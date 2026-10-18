import { describe, expect, it, vi } from 'vitest';
import type { ClientRowDto, TrainerBookingDto, TrainerRequestDto } from '@chefer/types';
import { TrainerDashboardService } from './trainer-dashboard.service.js';

// The default singletons pull in lib/env.js; the unit-test job has no env.
vi.mock('./coaching-link.service.js', () => ({ coachingLinkService: {} }));
vi.mock('./coaching-request.service.js', () => ({ coachingRequestService: {} }));
vi.mock('./booking.service.js', () => ({ bookingService: {} }));

// trainer.badges / trainer.dashboard.summary (trainer-mode.md §6.1, §7.1): the
// numbers come from the same lists the Clients tab shows.

const TODAY = '2026-10-18';
/** Sunday 18 Oct 2026, 12:00 UTC (15:00 in Bucharest). */
const NOW = new Date('2026-10-18T12:00:00Z');

function booking(
  startsAt: string,
  attendance: TrainerBookingDto['clients'][number]['attendance'],
  over: Partial<TrainerBookingDto> = {},
): TrainerBookingDto {
  return {
    id: startsAt,
    kind: 'BOOKING',
    seriesId: null,
    startsAt,
    endsAt: new Date(Date.parse(startsAt) + 3_600_000).toISOString(),
    durationMin: 60,
    timeZone: 'Europe/Bucharest',
    location: null,
    note: null,
    cancelledAt: null,
    cancelReason: null,
    version: 1,
    clients: [
      {
        clientId: 'a',
        name: 'Client a',
        attendance,
        workout: { kind: 'NEXT_DAY', routineDayId: null, name: null },
        workoutSessionId: null,
      },
    ],
    ...over,
  };
}

function client(id: string, over: Partial<ClientRowDto> = {}): ClientRowDto {
  return {
    clientId: id,
    name: `Client ${id}`,
    since: '2026-10-01T00:00:00.000Z',
    label: null,
    lastWorkoutDate: '2026-10-17',
    week: { sessions: 1, goal: 2 },
    inactiveDays: 1,
    routineChangedByClientAt: null,
    ...over,
  };
}

const request = (id: string) => ({ id }) as TrainerRequestDto;

function make(
  clients: ClientRowDto[],
  requests: TrainerRequestDto[],
  counts = new Map(),
  bookings: TrainerBookingDto[] = [],
) {
  const deps = {
    links: { listClients: vi.fn(async () => clients) },
    requests: { listForTrainer: vi.fn(async () => requests) },
    content: { countSessions: vi.fn(async () => counts) },
    bookings: { listVisible: vi.fn(async () => bookings) },
    now: () => NOW,
  };
  return { service: new TrainerDashboardService(deps), deps };
}

describe('TrainerDashboardService', () => {
  it('badges: pending requests, with attendance and booking changes at 0 with no bookings', async () => {
    const { service } = make([], [request('r1'), request('r2')]);
    expect(await service.badges('t1')).toEqual({
      requests: 2,
      unmarkedAttendance: 0,
      bookingChanges: 0,
      total: 2,
    });
  });

  it('summary: counts the last 7 days ending today for every client', async () => {
    const counts = new Map([
      ['a', 2],
      ['b', 1],
    ]);
    const { service, deps } = make(
      [client('a'), client('b', { inactiveDays: 8, lastWorkoutDate: '2026-10-10' })],
      [request('r1')],
      counts,
    );
    const summary = await service.summary('t1', TODAY);
    expect(deps.links.listClients).toHaveBeenCalledWith('t1', TODAY);
    expect(deps.content.countSessions).toHaveBeenCalledWith(['a', 'b'], '2026-10-12', TODAY);
    expect(summary).toEqual({
      activeClients: 2,
      maxClients: 50,
      requestsWaiting: 1,
      averageAdherence: 0.75,
      quietClients: [
        { clientId: 'b', name: 'Client b', lastWorkoutDate: '2026-10-10', inactiveDays: 8 },
      ],
      bookingsThisWeek: { scheduled: 0, done: 0 },
      nextBooking: null,
      todayBookings: [],
      unmarkedAttendance: [],
      sessionsDelivered: [],
    });
  });

  it('summary: a brand-new trainer runs no session query', async () => {
    const { service, deps } = make([], []);
    expect(await service.summary('t1', TODAY)).toMatchObject({
      activeClients: 0,
      requestsWaiting: 0,
      averageAdherence: null,
    });
    expect(deps.content.countSessions).not.toHaveBeenCalled();
  });

  // Trainer mode M3: the booking parts and the badge count come from the same list.
  it('badges and summary agree: unmarked past bookings, this week, next, today, delivered', async () => {
    const rows = [
      booking('2026-10-05T15:00:00.000Z', 'ATTENDED'), // the Monday before: last week, delivered this month
      booking('2026-10-16T15:00:00.000Z', 'SCHEDULED'), // Friday, unmarked
      booking('2026-10-17T15:00:00.000Z', 'ATTENDED'), // Saturday, done
      booking('2026-10-18T16:00:00.000Z', 'SCHEDULED'), // today 19:00 local: next
      booking('2026-10-18T18:00:00.000Z', 'SCHEDULED'), // today 21:00: later today
      booking('2026-10-18T17:00:00.000Z', 'SCHEDULED', { cancelledAt: NOW.toISOString() }),
      booking('2026-10-16T08:00:00.000Z', 'SCHEDULED', { kind: 'BLOCK', clients: [] }),
    ];
    const { service } = make([client('a')], [request('r1')], new Map(), rows);
    expect(await service.badges('t1')).toEqual({
      requests: 1,
      unmarkedAttendance: 1,
      bookingChanges: 0,
      total: 2,
    });
    const summary = await service.summary('t1', TODAY);
    expect(summary.bookingsThisWeek).toEqual({ scheduled: 4, done: 1 });
    expect(summary.nextBooking?.id).toBe('2026-10-18T16:00:00.000Z');
    expect(summary.todayBookings?.map((b) => b.id)).toEqual(['2026-10-18T18:00:00.000Z']);
    expect(summary.unmarkedAttendance?.map((b) => b.id)).toEqual(['2026-10-16T15:00:00.000Z']);
    expect(summary.sessionsDelivered).toEqual([{ clientId: 'a', name: 'Client a', count: 2 }]);
  });
});
