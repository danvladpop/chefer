import { describe, expect, it, vi } from 'vitest';
import type { BookingWithClients } from '@chefer/database';
import { PushRemindersService, REMINDER_WINDOW_MIN } from './push-reminders.service.js';
import type { PushEnqueueInput } from './push.service.js';

// Remote booking reminders (trainer-mode.md §7.2, M4): bookings starting in
// about an hour → the clients still SCHEDULED and the trainer, keyed per
// booking start so the per-minute sweep enqueues each once.

const NOW = new Date('2026-10-21T14:00:00Z');
const ANA = 'ctrainer00000000000000001';
const MARIA = 'cclient000000000000000001';
const IOANA = 'cclient000000000000000002';
const GONE = 'cclient000000000000000003';

function booking(over: Partial<BookingWithClients> = {}): BookingWithClients {
  return {
    id: 'b1',
    trainerId: ANA,
    seriesId: null,
    kind: 'BOOKING',
    startsAt: new Date('2026-10-21T15:00:00Z'),
    durationMin: 60,
    timeZone: 'Europe/Bucharest',
    location: 'Iron Gym',
    note: 'bring knee sleeve',
    cancelledAt: null,
    cancelReason: null,
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
    clients: [
      {
        bookingId: 'b1',
        clientId: MARIA,
        workoutRef: { kind: 'ROUTINE_DAY', routineDayId: 'd1' },
        attendance: 'SCHEDULED',
        attendanceAt: null,
        workoutSessionId: null,
      },
    ],
    ...over,
  };
}

function setup(rows: BookingWithClients[]) {
  const enqueue = vi.fn(async (_input: PushEnqueueInput) => 'queued' as const);
  const listStartingBetween = vi.fn(async () => rows);
  const service = new PushRemindersService({
    bookings: {
      listStartingBetween,
      routineDayNames: vi.fn(async () => new Map([['d1', 'Lower body A']])),
    },
    users: {
      findUsers: vi.fn(async () => [
        { id: MARIA, firstName: 'Maria', lastName: 'Pop', name: null, image: null },
        { id: IOANA, firstName: 'Ioana', lastName: null, name: null, image: null },
      ]),
    },
    trainers: {
      findMany: vi.fn(async () => [
        { userId: ANA, displayName: 'Ana', gymLine: null, activatedAt: NOW, disabledAt: null },
      ]),
    },
    push: { enqueue },
  });
  const inputs = () => enqueue.mock.calls.map((c) => c[0]);
  return { service, enqueue, inputs, listStartingBetween };
}

describe('PushRemindersService.enqueueDue', () => {
  it('looks at bookings starting 55–65 minutes from now', async () => {
    const { service, listStartingBetween } = setup([]);
    await expect(service.enqueueDue(NOW)).resolves.toEqual({ bookings: 0, queued: 0 });
    expect(listStartingBetween).toHaveBeenCalledWith(
      new Date(NOW.getTime() + REMINDER_WINDOW_MIN.from * 60_000),
      new Date(NOW.getTime() + REMINDER_WINDOW_MIN.to * 60_000),
    );
  });

  it('reminds the client and the trainer, keyed per booking start; time in the booking zone', async () => {
    const { service, inputs } = setup([booking()]);
    await expect(service.enqueueDue(NOW)).resolves.toEqual({ bookings: 1, queued: 2 });
    const eventKey = `b1:${new Date('2026-10-21T15:00:00Z').getTime()}`;
    expect(inputs()).toEqual([
      {
        userId: MARIA,
        kind: 'BOOKING_REMINDER_CLIENT',
        actorId: null,
        eventKey,
        payload: {
          title: 'Booking in 1 hour',
          body: 'Session with Ana in 1 hour',
          data: { bookingId: 'b1' },
        },
      },
      {
        userId: ANA,
        kind: 'BOOKING_REMINDER_TRAINER',
        actorId: null,
        eventKey,
        payload: {
          title: 'Booking in 1 hour',
          // 15:00Z is 18:00 in Bucharest (EEST).
          body: '18:00 Maria · Lower body A',
          data: { bookingId: 'b1' },
        },
      },
    ]);
    // Never the note or the location.
    expect(JSON.stringify(inputs())).not.toMatch(/knee|Iron Gym/);
  });

  it('skips cancelled places; a group shows "Maria + 1"; nobody booked → no reminder at all', async () => {
    const place = (clientId: string, attendance: 'SCHEDULED' | 'CANCELLED') => ({
      bookingId: 'b2',
      clientId,
      workoutRef: null,
      attendance,
      attendanceAt: null,
      workoutSessionId: null,
    });
    const { service, inputs } = setup([
      booking({
        id: 'b2',
        clients: [place(MARIA, 'SCHEDULED'), place(GONE, 'CANCELLED'), place(IOANA, 'SCHEDULED')],
      }),
      booking({ id: 'b3', clients: [place(GONE, 'CANCELLED')] }),
    ]);
    await service.enqueueDue(NOW);
    expect(inputs().map((i) => [i.userId, i.kind])).toEqual([
      [MARIA, 'BOOKING_REMINDER_CLIENT'],
      [IOANA, 'BOOKING_REMINDER_CLIENT'],
      [ANA, 'BOOKING_REMINDER_TRAINER'],
    ]);
    expect(inputs()[2]?.payload.body).toBe('18:00 Maria + 1');
  });

  it('a duplicate (the next minute) counts as nothing queued', async () => {
    const { service, enqueue } = setup([booking()]);
    enqueue.mockResolvedValue('duplicate' as never);
    await expect(service.enqueueDue(NOW)).resolves.toEqual({ bookings: 1, queued: 0 });
  });
});
