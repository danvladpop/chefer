import { z } from 'zod';
import type { BookingWorkoutRef, SessionsDeliveredDto, TrainerBookingDto } from '@chefer/types';
import { addDaysLocal, utcToZoned, weekStartOf } from '@chefer/utils';

// ─── Trainer mode M3: booking rules (docs/prd-2026-10/trainer-mode.md §6.1, §6.7, §8.2) ──
// Pure functions over booking DTOs, shared by the booking service, the
// dashboard and badges, so "all numbers match the underlying lists" (§6.1).
// A booking's local date is judged in the zone it was made in.

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/** "Mark attendance" looks back this far (trainer Today and the badge use the same window). */
export const UNMARKED_LOOKBACK_DAYS = 30;
/** `trainer.client.bookings` past list: the last 90 days (contract). */
export const CLIENT_PAST_DAYS = 90;

/** What a BookingClient row stores (`workoutRef`): a routine day, or null = NEXT_DAY. */
export const storedWorkoutRefSchema = z.object({
  kind: z.literal('ROUTINE_DAY'),
  routineDayId: z.string().min(1),
});
export type StoredWorkoutRef = z.infer<typeof storedWorkoutRefSchema>;

/** The stored JSON, parsed at the boundary; anything unreadable is NEXT_DAY. */
export function readWorkoutRef(json: unknown): StoredWorkoutRef | null {
  const parsed = storedWorkoutRefSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

/** The stored form of an input ref once templates are assigned (TEMPLATE never reaches storage). */
export function toStoredRef(
  ref: Exclude<BookingWorkoutRef, { kind: 'TEMPLATE' }> | undefined,
): StoredWorkoutRef | null {
  return ref?.kind === 'ROUTINE_DAY'
    ? { kind: 'ROUTINE_DAY', routineDayId: ref.routineDayId }
    : null;
}

export function endOf(b: { startsAt: Date | string; durationMin: number }): Date {
  return new Date(new Date(b.startsAt).getTime() + b.durationMin * MINUTE_MS);
}

/** The slot is over (its end is at or before `now`). */
export function hasEnded(b: { startsAt: Date | string; durationMin: number }, now: Date): boolean {
  return endOf(b).getTime() <= now.getTime();
}

/** The booking's local date in its own zone. */
export function localDateOf(b: { startsAt: Date | string; timeZone: string }): string {
  return utcToZoned(b.startsAt, b.timeZone).date;
}

/** A live booking (not blocked time, not cancelled). */
export function isLiveBooking(b: TrainerBookingDto): boolean {
  return b.kind === 'BOOKING' && b.cancelledAt === null;
}

/** Ended, live, and some (current) client is still SCHEDULED: "Mark attendance". */
export function needsAttendance(b: TrainerBookingDto, now: Date): boolean {
  return (
    isLiveBooking(b) && hasEnded(b, now) && b.clients.some((c) => c.attendance === 'SCHEDULED')
  );
}

/** Past bookings to mark, newest first, within `UNMARKED_LOOKBACK_DAYS`. */
export function unmarkedAttendance(
  bookings: readonly TrainerBookingDto[],
  now: Date,
): TrainerBookingDto[] {
  const since = now.getTime() - UNMARKED_LOOKBACK_DAYS * DAY_MS;
  return bookings
    .filter((b) => needsAttendance(b, now) && endOf(b).getTime() >= since)
    .sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt));
}

/**
 * "Bookings this week" (§6.1): live bookings whose local date falls in the
 * Monday-start week of `today`. Done = ended with every client marked.
 */
export function bookingsThisWeek(
  bookings: readonly TrainerBookingDto[],
  today: string,
  now: Date,
): { scheduled: number; done: number } {
  const start = weekStartOf(today);
  const end = addDaysLocal(start, 6);
  const inWeek = bookings.filter((b) => {
    if (!isLiveBooking(b)) return false;
    const d = localDateOf(b);
    return d >= start && d <= end;
  });
  return {
    scheduled: inWeek.length,
    done: inWeek.filter(
      (b) =>
        hasEnded(b, now) &&
        b.clients.length > 0 &&
        b.clients.every((c) => c.attendance !== 'SCHEDULED'),
    ).length,
  };
}

/** The next live booking that has not ended, and the rest of `today`'s after it. */
export function upcomingToday(
  bookings: readonly TrainerBookingDto[],
  today: string,
  now: Date,
): { next: TrainerBookingDto | null; rest: TrainerBookingDto[] } {
  const ahead = bookings
    .filter((b) => isLiveBooking(b) && !hasEnded(b, now))
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const next = ahead[0] ?? null;
  return {
    next,
    rest: ahead.filter((b) => b !== next && localDateOf(b) === today),
  };
}

/** "YYYY-MM" of the month before `localDate`'s. */
export function previousMonthOf(localDate: string): string {
  const y = Number(localDate.slice(0, 4));
  const m = Number(localDate.slice(5, 7));
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

/** Attended places of `clientId` in live bookings whose local month is `month` ("YYYY-MM"). */
export function attendedInMonth(
  bookings: readonly TrainerBookingDto[],
  clientId: string,
  month: string,
): number {
  return bookings.filter(
    (b) =>
      isLiveBooking(b) &&
      localDateOf(b).startsWith(month) &&
      b.clients.some((c) => c.clientId === clientId && c.attendance === 'ATTENDED'),
  ).length;
}

/** "Sessions delivered this month" (§6.1, O-4): per current client, attended bookings; most first. */
export function sessionsDelivered(
  bookings: readonly TrainerBookingDto[],
  today: string,
): SessionsDeliveredDto[] {
  const month = today.slice(0, 7);
  const counts = new Map<string, SessionsDeliveredDto>();
  for (const b of bookings) {
    if (!isLiveBooking(b) || !localDateOf(b).startsWith(month)) continue;
    for (const c of b.clients) {
      if (c.attendance !== 'ATTENDED') continue;
      const row = counts.get(c.clientId) ?? { clientId: c.clientId, name: c.name, count: 0 };
      row.count += 1;
      counts.set(c.clientId, row);
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
