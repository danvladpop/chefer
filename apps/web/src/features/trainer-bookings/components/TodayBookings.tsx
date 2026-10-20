'use client';

import Link from 'next/link';
import { CalendarPlus, ChevronRight, MapPin } from 'lucide-react';
import { BOOKING_COPY, type SessionsDeliveredDto, type TrainerBookingDto } from '@chefer/types';
import { Button, pressCard } from '@chefer/ui';
import {
  bookingTimeRange,
  bookingWhat,
  bookingWhen,
  bookingWho,
  cn,
  todaysNextBooking,
} from '@chefer/utils';
import { StartButton } from './StartButton';

// ─── Trainer Today: the booking parts (trainer-mode.md §6.1, M3) ──────────────
// Next booking (Start from 15 minutes before), the rest of today, past
// bookings that still need attendance, and sessions delivered this month.

const copy = BOOKING_COPY.today;
const detailHref = (b: TrainerBookingDto) => `/trainer/bookings/${encodeURIComponent(b.id)}`;

function BookingRow({ booking, when }: { booking: TrainerBookingDto; when: string }) {
  const what = bookingWhat(booking);
  return (
    <li>
      <Link
        href={detailHref(booking)}
        className={cn(
          'flex min-h-11 items-center gap-3 rounded-2xl border bg-white px-4 py-3 shadow-sm hover:bg-neutral-50',
          // MO-01 card press.
          pressCard,
        )}
        data-testid="trainer-today-booking-row"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-gray-900">{when}</span>
          <span className="block min-w-0 break-words text-sm text-gray-700">
            {[bookingWho(booking), what].filter(Boolean).join(' · ')}
          </span>
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 text-gray-400" aria-hidden="true" />
      </Link>
    </li>
  );
}

/** "Next booking": today's next one with Start, or "No bookings today" + Add a booking. */
export function NextBookingCard({
  booking,
  timeZone,
  today,
  now,
  onAdd,
}: {
  booking: TrainerBookingDto | null;
  timeZone: string;
  today: string;
  now: Date;
  onAdd: () => void;
}) {
  const { today: todays, later } = todaysNextBooking(booking, timeZone, today);
  return (
    <section
      aria-labelledby="trainer-today-next"
      className="flex flex-col gap-2"
      data-testid="trainer-today-next"
    >
      <h2 id="trainer-today-next" className="font-semibold text-gray-900">
        {copy.nextBooking}
      </h2>
      {todays ? (
        <div className="flex min-w-0 flex-col gap-3 rounded-2xl border border-[#f2c9a1] bg-[#fff8f1] p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-lg font-bold text-gray-900">{bookingTimeRange(todays, timeZone)}</p>
            <Link
              href={detailHref(todays)}
              className="block min-w-0 break-words font-semibold text-gray-900 underline-offset-2 hover:underline"
            >
              {todays.clients.map((c) => c.name).join(', ') || bookingWho(todays)}
            </Link>
            <p className="min-w-0 break-words text-sm text-gray-700">
              {bookingWhat(todays) ?? BOOKING_COPY.editor.nextDay}
            </p>
            {todays.location && (
              <p className="flex min-w-0 items-center gap-1 text-sm text-gray-600">
                <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0 break-words">{todays.location}</span>
              </p>
            )}
          </div>
          <StartButton booking={todays} now={now} className="shrink-0" />
        </div>
      ) : (
        <div className="flex min-w-0 flex-col gap-3 rounded-2xl border bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="font-medium text-gray-900">{copy.noBookingsToday}</p>
            {later && (
              <Link
                href={detailHref(later)}
                className="block min-w-0 break-words text-sm text-gray-700 underline underline-offset-2"
              >
                {`${copy.nextOn(bookingWhen(later.startsAt, timeZone))} · ${bookingWho(later)}`}
              </Link>
            )}
          </div>
          <Button type="button" variant="outline" className="min-h-11 shrink-0" onClick={onAdd}>
            <CalendarPlus className="h-4 w-4" aria-hidden="true" /> {BOOKING_COPY.schedule.add}
          </Button>
        </div>
      )}
    </section>
  );
}

/** The rest of today (after the next one): compact rows → booking detail. */
export function TodaysBookings({
  bookings,
  timeZone,
}: {
  bookings: TrainerBookingDto[];
  timeZone: string;
}) {
  if (bookings.length === 0) return null;
  return (
    <section aria-labelledby="trainer-today-later" className="flex flex-col gap-2">
      <h2 id="trainer-today-later" className="font-semibold text-gray-900">
        {copy.todaysBookings}
      </h2>
      <ul className="flex flex-col gap-2" data-testid="trainer-today-bookings">
        {bookings.map((b) => (
          <BookingRow key={b.id} booking={b} when={bookingTimeRange(b, timeZone)} />
        ))}
      </ul>
    </section>
  );
}

/** "2 past bookings need attendance" and those bookings. */
export function UnmarkedAttendance({
  bookings,
  timeZone,
}: {
  bookings: TrainerBookingDto[];
  timeZone: string;
}) {
  if (bookings.length === 0) return null;
  return (
    <div className="flex flex-col gap-2" data-testid="trainer-today-unmarked">
      <p className="text-sm font-medium text-amber-900">{copy.unmarked(bookings.length)}</p>
      <ul className="flex flex-col gap-2" aria-label={copy.unmarked(bookings.length)}>
        {bookings.map((b) => (
          <BookingRow key={b.id} booking={b} when={bookingWhen(b.startsAt, timeZone)} />
        ))}
      </ul>
    </div>
  );
}

/** Sessions delivered this month (O-4): "Maria · 6" → that client's Bookings tab. */
export function SessionsDelivered({ rows }: { rows: SessionsDeliveredDto[] }) {
  if (rows.length === 0) return null;
  return (
    <section
      aria-labelledby="trainer-today-delivered"
      className="flex flex-col gap-2"
      data-testid="trainer-today-delivered"
    >
      <h2 id="trainer-today-delivered" className="font-semibold text-gray-900">
        {copy.sessionsDelivered}
      </h2>
      <ul className="flex flex-col gap-2">
        {rows.map((r) => (
          <li key={r.clientId}>
            <Link
              href={`/trainer/${encodeURIComponent(r.clientId)}?tab=bookings`}
              className={cn(
                'flex min-h-11 items-center gap-3 rounded-2xl border bg-white px-4 py-3 shadow-sm hover:bg-neutral-50',
                pressCard,
              )}
            >
              <span className="min-w-0 flex-1 break-words text-sm font-medium text-gray-900">
                {copy.sessionsDeliveredRow(r.name, r.count)}
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 text-gray-400" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
      <p className="text-xs text-gray-600">{copy.sessionsDeliveredFooter}</p>
    </section>
  );
}
