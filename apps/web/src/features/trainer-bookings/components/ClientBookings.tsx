'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { localDate } from '@/features/gym/use-gym-bootstrap';
import { QueryError } from '@/features/trainer-mode/components/QueryError';
import { trpc } from '@/lib/trpc';
import { CalendarPlus, ChevronRight } from 'lucide-react';
import { BOOKING_COPY, type BookingAttendance, type TrainerBookingDto } from '@chefer/types';
import { Badge, Button, pressCard } from '@chefer/ui';
import {
  bookingTime,
  bookingWhat,
  bookingWhen,
  cn,
  deviceTimeZone,
  newBookingSlot,
} from '@chefer/utils';
import { BookingEditor, type EditorTarget } from './BookingEditor';

// ─── Client detail additions (trainer-mode.md §6.5, M3) ───────────────────────
// "Add a booking" (the editor pre-filled with this client) and the Bookings
// tab: upcoming and past bookings with this client, attendance, and sessions
// delivered this month / last month.

const copy = BOOKING_COPY.clientDetail;

/** Header action: the editor, pre-filled with this client. */
export function AddBookingButton({ clientId, name }: { clientId: string; name: string }) {
  const [target, setTarget] = useState<EditorTarget | null>(null);
  const timeZone = useMemo(deviceTimeZone, []);
  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="min-h-11"
        onClick={() =>
          setTarget({
            mode: 'create',
            ...newBookingSlot(null, new Date(), timeZone),
            clients: [{ clientId, name }],
          })
        }
      >
        <CalendarPlus className="h-4 w-4" aria-hidden="true" /> {copy.addBooking}
      </Button>
      <BookingEditor target={target} onClose={() => setTarget(null)} />
    </>
  );
}

/** One client's attendance on a booking, as the trainer sees it. */
function attendanceOf(booking: TrainerBookingDto, clientId: string): BookingAttendance {
  if (booking.cancelledAt) return 'CANCELLED';
  return booking.clients.find((c) => c.clientId === clientId)?.attendance ?? 'CANCELLED';
}

const ATTENDANCE_TEXT: Record<BookingAttendance, string> = {
  SCHEDULED: BOOKING_COPY.detail.scheduled,
  ATTENDED: BOOKING_COPY.detail.attended,
  NO_SHOW: BOOKING_COPY.detail.noShow,
  CANCELLED: BOOKING_COPY.schedule.cancelled,
};

function Row({
  booking,
  clientId,
  timeZone,
  showAttendance,
}: {
  booking: TrainerBookingDto;
  clientId: string;
  timeZone: string;
  showAttendance: boolean;
}) {
  const attendance = attendanceOf(booking, clientId);
  const cancelled = attendance === 'CANCELLED';
  const client = booking.clients.find((c) => c.clientId === clientId);
  const what = client?.workout.name ?? bookingWhat(booking);
  return (
    <li>
      <Link
        href={`/trainer/bookings/${encodeURIComponent(booking.id)}`}
        className={cn(
          'flex min-h-11 items-center gap-3 rounded-2xl border bg-white px-4 py-3 shadow-sm hover:bg-neutral-50',
          cancelled && 'bg-gray-50 text-gray-500',
          // MO-01 card press.
          pressCard,
        )}
        data-testid="client-booking-row"
      >
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              'block text-sm font-semibold text-gray-900',
              cancelled && 'text-gray-500 line-through',
            )}
          >
            {bookingWhen(booking.startsAt, timeZone)}–{bookingTime(booking.endsAt, timeZone)}
          </span>
          {what && <span className="block min-w-0 break-words text-sm text-gray-600">{what}</span>}
        </span>
        {(showAttendance || cancelled) && (
          <Badge variant={attendance === 'ATTENDED' ? 'success' : 'secondary'} className="shrink-0">
            {ATTENDANCE_TEXT[attendance]}
          </Badge>
        )}
        <ChevronRight className="h-5 w-5 shrink-0 text-gray-400" aria-hidden="true" />
      </Link>
    </li>
  );
}

/** Client detail → Bookings. */
export function ClientBookingsTab({ clientId }: { clientId: string }) {
  const timeZone = useMemo(deviceTimeZone, []);
  const query = trpc.trainer.client.bookings.useQuery(
    { clientId, today: localDate() },
    { retry: false, staleTime: 30_000 },
  );
  if (query.isError) return <QueryError error={query.error} onRetry={() => void query.refetch()} />;
  if (!query.data) {
    return <div className="h-40 animate-pulse rounded-2xl bg-gray-100" aria-hidden="true" />;
  }
  const { upcoming, past, deliveredThisMonth, deliveredLastMonth } = query.data;
  return (
    <div className="flex flex-col gap-5" data-testid="client-bookings-tab">
      <p className="text-sm font-medium text-gray-800" data-testid="client-bookings-delivered">
        {copy.deliveredThisMonth(deliveredThisMonth)} ·{' '}
        {copy.deliveredLastMonth(deliveredLastMonth)}
      </p>
      <section aria-labelledby="client-bookings-upcoming" className="flex flex-col gap-2">
        <h2 id="client-bookings-upcoming" className="font-semibold text-gray-900">
          {copy.upcoming}
        </h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-gray-600">{BOOKING_COPY.schedule.empty}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {upcoming.map((b) => (
              <Row
                key={b.id}
                booking={b}
                clientId={clientId}
                timeZone={timeZone}
                showAttendance={false}
              />
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="client-bookings-past" className="flex flex-col gap-2">
        <h2 id="client-bookings-past" className="font-semibold text-gray-900">
          {copy.past}
        </h2>
        {past.length === 0 ? (
          <p className="text-sm text-gray-600">{BOOKING_COPY.schedule.empty}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {past.map((b) => (
              <Row key={b.id} booking={b} clientId={clientId} timeZone={timeZone} showAttendance />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
