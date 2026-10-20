'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useNow } from '@/features/trainer-bookings/use-bookings';
import { trpc } from '@/lib/trpc';
import { CalendarDays, ChevronRight, MapPin } from 'lucide-react';
import { BOOKING_COPY, type ClientBookingDto } from '@chefer/types';
import { Badge, pressCard } from '@chefer/ui';
import {
  bookingTime,
  bookingTimeRange,
  bookingWhen,
  bookingZoneHint,
  clientCardText,
  cn,
  deviceTimeZone,
  formatDayWithWeekday,
  nextClientCardBooking,
  userFacingErrorMessage,
  utcToZoned,
} from '@chefer/utils';
import { useCoachingAvailability } from '../use-coaching-availability';

// ─── The client's bookings (trainer-mode.md §6.9) ─────────────────────────────
// Anyone with a trainer: the upcoming-booking card on Today and Gym Today (the
// next one within 7 days), "Upcoming bookings" on Your trainer, and a read-only
// detail page. Never another client's name (§10).

const copy = BOOKING_COPY.client;
const detailHref = (b: ClientBookingDto) => `/coaching/bookings/${encodeURIComponent(b.id)}`;

/** `coaching.bookings.upcoming` for a client who has a trainer (else nothing is fetched). */
export function useUpcomingBookings() {
  const { enabled } = useCoachingAvailability();
  const status = trpc.coaching.status.useQuery(undefined, {
    enabled,
    retry: false,
    staleTime: 60_000,
  });
  const hasTrainer = enabled && status.data?.trainer != null;
  const upcoming = trpc.coaching.bookings.upcoming.useQuery(undefined, {
    enabled: hasTrainer,
    retry: false,
    staleTime: 60_000,
  });
  return { hasTrainer, bookings: hasTrainer ? (upcoming.data ?? []) : [] };
}

/** Today / Gym Today: "Session with Ana · Tue 18:00 · Gym Fit Center" → the booking. */
export function UpcomingBookingCard({ className }: { className?: string }) {
  const timeZone = useMemo(deviceTimeZone, []);
  const now = useNow();
  const { bookings } = useUpcomingBookings();
  const next = nextClientCardBooking(bookings, now);
  if (!next) return null;
  return (
    <Link
      href={detailHref(next)}
      className={cn(
        'flex min-h-11 min-w-0 items-center gap-3 rounded-2xl border border-[#f2c9a1] bg-[#fff8f1] p-4 shadow-sm hover:bg-[#fff3e8]',
        // MO-01 card press.
        pressCard,
        className,
      )}
      data-testid="client-booking-card"
    >
      <CalendarDays className="h-5 w-5 shrink-0 text-[#944a00]" aria-hidden="true" />
      <span className="min-w-0 flex-1 break-words text-sm font-medium text-gray-900">
        {clientCardText(next, timeZone, utcToZoned(now, timeZone).date)}
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-gray-400" aria-hidden="true" />
    </Link>
  );
}

/** Your trainer → "Upcoming bookings" (read-only; cancelled ones greyed until they start). */
export function UpcomingBookingsList() {
  const timeZone = useMemo(deviceTimeZone, []);
  const { hasTrainer, bookings } = useUpcomingBookings();
  if (!hasTrainer) return null;
  return (
    <div className="flex flex-col gap-2" data-testid="client-upcoming-bookings">
      <h3 className="text-sm font-semibold text-gray-900">{copy.upcoming}</h3>
      {bookings.length === 0 ? (
        <p className="text-sm text-gray-600">{copy.none}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {bookings.map((b) => (
            <li key={b.id}>
              <Link
                href={detailHref(b)}
                className={cn(
                  'flex min-h-11 items-center gap-3 rounded-xl border bg-white px-3 py-2 hover:bg-neutral-50',
                  b.cancelledAt && 'bg-gray-50 text-gray-500',
                  pressCard,
                )}
              >
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      'block text-sm font-medium text-gray-900',
                      b.cancelledAt && 'text-gray-500 line-through',
                    )}
                  >
                    {bookingWhen(b.startsAt, timeZone)}–{bookingTime(b.endsAt, timeZone)}
                  </span>
                  {(b.location !== null || b.otherClients > 0) && (
                    <span className="block min-w-0 break-words text-xs text-gray-600">
                      {[b.location, b.otherClients > 0 ? copy.withOthers(b.otherClients) : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  )}
                </span>
                {b.cancelledAt && <Badge variant="secondary">{copy.cancelled}</Badge>}
                <ChevronRight className="h-5 w-5 shrink-0 text-gray-400" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** /coaching/bookings/[id]: the client's read-only booking. */
export function ClientBookingDetail({ bookingId }: { bookingId: string }) {
  const timeZone = useMemo(deviceTimeZone, []);
  const { enabled } = useCoachingAvailability();
  const query = trpc.coaching.bookings.get.useQuery({ bookingId }, { enabled, retry: false });
  const b = query.data;
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-4 px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="font-serif text-2xl font-bold text-gray-900">{copy.detailTitle}</h1>
      {query.isError ? (
        <p role="alert" className="text-sm text-gray-700">
          {userFacingErrorMessage(query.error)}
        </p>
      ) : !b ? (
        <div className="h-40 animate-pulse rounded-2xl bg-gray-100" aria-hidden="true" />
      ) : (
        <section
          className={cn(
            'flex flex-col gap-3 rounded-2xl border bg-white p-4 shadow-sm',
            b.cancelledAt && 'bg-gray-50 text-gray-500',
          )}
          data-testid="client-booking-detail"
        >
          {b.cancelledAt && (
            <div className="flex flex-col gap-1">
              <Badge variant="secondary" className="self-start">
                {copy.cancelled}
              </Badge>
              {b.cancelReason && <p className="text-sm text-gray-700">{b.cancelReason}</p>}
            </div>
          )}
          <p className={cn('font-semibold text-gray-900', b.cancelledAt && 'line-through')}>
            {BOOKING_COPY.client.card(
              b.trainer.name,
              formatDayWithWeekday(utcToZoned(b.startsAt, timeZone).date),
            )}
          </p>
          <p className="text-sm text-gray-800">{bookingTimeRange(b, timeZone)}</p>
          {bookingZoneHint(b, timeZone) && (
            <p className="text-sm italic text-gray-600">{bookingZoneHint(b, timeZone)}</p>
          )}
          {b.otherClients > 0 && (
            <p className="text-sm text-gray-700">{copy.withOthers(b.otherClients)}</p>
          )}
          {b.location && (
            <p className="flex min-w-0 items-center gap-1 text-sm text-gray-700">
              <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 break-words">{b.location}</span>
            </p>
          )}
          {b.workoutName && (
            <p className="text-sm text-gray-700">
              <span className="font-medium">{BOOKING_COPY.editor.workout}:</span> {b.workoutName}
            </p>
          )}
          {b.note && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">{b.note}</p>
          )}
        </section>
      )}
    </div>
  );
}
