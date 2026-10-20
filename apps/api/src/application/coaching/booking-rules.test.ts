import { describe, expect, it } from 'vitest';
import type { BookingAttendance, TrainerBookingDto } from '@chefer/types';
import { zonedToUtc } from '@chefer/utils';
import {
  attendedInMonth,
  bookingsThisWeek,
  needsAttendance,
  readWorkoutRef,
  sessionsDelivered,
  unmarkedAttendance,
  upcomingToday,
} from './booking-rules.js';

// The counts behind trainer Today and trainer.badges (trainer-mode.md §6.1, §7.1,
// O-4): attendance rules, "bookings this week" judged in each booking's own zone,
// and sessions delivered. Blocked time and cancelled bookings never count.

const ZONE = 'Europe/Bucharest';
/** Wednesday 21 Oct 2026, 12:00 UTC. */
const NOW = new Date('2026-10-21T12:00:00Z');
const TODAY = '2026-10-21';

let seq = 0;
function dto(
  date: string,
  time: string,
  clients: [string, BookingAttendance][] = [['maria', 'SCHEDULED']],
  over: Partial<TrainerBookingDto> = {},
): TrainerBookingDto {
  seq += 1;
  const zone = over.timeZone ?? ZONE;
  const startsAt = zonedToUtc(date, time, zone);
  return {
    id: `b${seq}`,
    kind: 'BOOKING',
    seriesId: null,
    startsAt: startsAt.toISOString(),
    endsAt: new Date(startsAt.getTime() + 60 * 60_000).toISOString(),
    durationMin: 60,
    timeZone: zone,
    location: null,
    note: null,
    cancelledAt: null,
    cancelReason: null,
    version: 1,
    clients: clients.map(([clientId, attendance]) => ({
      clientId,
      name: clientId === 'maria' ? 'Maria' : 'Ion',
      attendance,
      workout: { kind: 'NEXT_DAY', routineDayId: null, name: null },
      workoutSessionId: null,
    })),
    ...over,
  };
}

describe('attendance', () => {
  it('a past live booking with anyone SCHEDULED needs marking; marked, future, cancelled or blocked do not', () => {
    const unmarked = dto('2026-10-20', '18:00');
    const half = dto('2026-10-20', '19:00', [
      ['maria', 'ATTENDED'],
      ['ion', 'SCHEDULED'],
    ]);
    const marked = dto('2026-10-20', '17:00', [['maria', 'NO_SHOW']]);
    const future = dto('2026-10-22', '18:00');
    const cancelled = dto('2026-10-19', '18:00', undefined, { cancelledAt: NOW.toISOString() });
    const block = dto('2026-10-19', '10:00', [], { kind: 'BLOCK' });
    const running = dto(TODAY, '14:30'); // 11:30–12:30 UTC: not ended yet
    expect(
      [unmarked, half, marked, future, cancelled, block, running].map((b) =>
        needsAttendance(b, NOW),
      ),
    ).toEqual([true, true, false, false, false, false, false]);
  });

  it('the unmarked list (and the badge count) looks back 30 days, newest first', () => {
    const old = dto('2026-09-10', '18:00');
    const a = dto('2026-10-19', '18:00');
    const b = dto('2026-10-20', '18:00');
    expect(unmarkedAttendance([old, a, b], NOW).map((x) => x.id)).toEqual([b.id, a.id]);
  });
});

describe('bookings this week', () => {
  it('counts live bookings in the Monday-start week; done = ended with every client marked', () => {
    const doneMon = dto('2026-10-19', '18:00', [['maria', 'ATTENDED']]);
    const pendingTue = dto('2026-10-20', '18:00', [
      ['maria', 'ATTENDED'],
      ['ion', 'SCHEDULED'],
    ]);
    const laterSun = dto('2026-10-25', '18:00');
    const lastWeek = dto('2026-10-18', '18:00', [['maria', 'ATTENDED']]);
    const cancelled = dto('2026-10-22', '18:00', undefined, { cancelledAt: NOW.toISOString() });
    const block = dto('2026-10-22', '09:00', [], { kind: 'BLOCK' });
    expect(
      bookingsThisWeek([doneMon, pendingTue, laterSun, lastWeek, cancelled, block], TODAY, NOW),
    ).toEqual({ scheduled: 3, done: 1 });
  });

  it('judges the week in the booking’s own zone (Monday 00:30 in Bucharest is Sunday in UTC)', () => {
    const earlyMonday = dto('2026-10-19', '00:30', [['maria', 'ATTENDED']]);
    expect(earlyMonday.startsAt.startsWith('2026-10-18')).toBe(true);
    expect(bookingsThisWeek([earlyMonday], TODAY, NOW)).toEqual({ scheduled: 1, done: 1 });
  });
});

describe('next booking and today', () => {
  it('next = the soonest live booking not ended (a running one counts); rest = the others today', () => {
    const running = dto(TODAY, '14:30');
    const later = dto(TODAY, '19:00');
    const tomorrow = dto('2026-10-22', '08:00');
    const cancelled = dto(TODAY, '16:00', undefined, { cancelledAt: NOW.toISOString() });
    const { next, rest } = upcomingToday([tomorrow, later, cancelled, running], TODAY, NOW);
    expect(next?.id).toBe(running.id);
    expect(rest.map((b) => b.id)).toEqual([later.id]);
  });
});

describe('sessions delivered (O-4)', () => {
  it('counts ATTENDED places per client in the calendar month, most first', () => {
    const rows = [
      dto('2026-10-01', '18:00', [['maria', 'ATTENDED']]),
      dto('2026-10-05', '18:00', [
        ['maria', 'ATTENDED'],
        ['ion', 'ATTENDED'],
      ]),
      dto('2026-10-06', '18:00', [['ion', 'NO_SHOW']]),
      dto('2026-09-30', '18:00', [['maria', 'ATTENDED']]),
    ];
    expect(sessionsDelivered(rows, TODAY)).toEqual([
      { clientId: 'maria', name: 'Maria', count: 2 },
      { clientId: 'ion', name: 'Ion', count: 1 },
    ]);
    expect(attendedInMonth(rows, 'maria', '2026-09')).toBe(1);
  });
});

it('a stored workout ref parses at the boundary; anything else is NEXT_DAY', () => {
  expect(readWorkoutRef({ kind: 'ROUTINE_DAY', routineDayId: 'd1' })).toEqual({
    kind: 'ROUTINE_DAY',
    routineDayId: 'd1',
  });
  expect(readWorkoutRef(null)).toBeNull();
  expect(readWorkoutRef({ kind: 'TEMPLATE', templateId: 't' })).toBeNull();
});
