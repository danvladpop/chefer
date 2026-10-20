'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useMemo, useState } from 'react';
import { QueryError } from '@/features/trainer-mode/components/QueryError';
import { capture } from '@/lib/analytics';
import { trpc } from '@/lib/trpc';
import { ArrowLeft } from 'lucide-react';
import {
  BOOKING_COPY,
  TRAINER_MODE_LIMITS,
  type BookingAttendance,
  type BookingScope,
  type TrainerBookingClientDto,
  type TrainerBookingDto,
} from '@chefer/types';
import { Badge, Button, pressControl, Sheet } from '@chefer/ui';
import {
  bookingTimeRange,
  bookingWho,
  bookingZoneHint,
  canChangeBooking,
  canMarkAttendance,
  cn,
  deviceTimeZone,
  formatDayWithWeekday,
  userFacingErrorMessage,
  utcToZoned,
} from '@chefer/utils';
import { useInvalidateBookings, useNow, useOnline } from '../use-bookings';
import { BookingEditor, type EditorTarget } from './BookingEditor';
import { StartButton } from './StartButton';

// ─── Booking detail (trainer-mode.md §5.4, §6.2, §6.3) ────────────────────────
// Time (+ zone hint), each client with attendance, workout, location, note;
// Start (from 15 minutes before) opens the coached logger; Edit opens the
// editor; Cancel asks the scope and an optional reason the clients see.
// A cancelled booking stays, greyed, with its reason (never hard-deleted).

const copy = BOOKING_COPY.detail;

const ATTENDANCE_TEXT: Record<BookingAttendance, string> = {
  SCHEDULED: copy.scheduled,
  ATTENDED: copy.attended,
  NO_SHOW: copy.noShow,
  CANCELLED: BOOKING_COPY.schedule.cancelled,
};

function AttendanceRow({
  booking,
  client,
  markable,
  busy,
  onMark,
}: {
  booking: TrainerBookingDto;
  client: TrainerBookingClientDto;
  markable: boolean;
  busy: boolean;
  onMark: (attendance: 'ATTENDED' | 'NO_SHOW' | 'SCHEDULED') => void;
}) {
  const workout = client.workout.name ?? BOOKING_COPY.editor.nextDay;
  return (
    <li
      className="flex min-w-0 flex-col gap-2 rounded-xl border bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
      data-testid="booking-client"
    >
      <div className="min-w-0">
        <Link
          href={`/trainer/${encodeURIComponent(client.clientId)}`}
          className="font-semibold text-gray-900 underline-offset-2 hover:underline"
        >
          {client.name}
        </Link>
        <p className="min-w-0 break-words text-sm text-gray-600">{workout}</p>
        {client.workoutSessionId && (
          <p className="text-xs font-medium text-emerald-800">{copy.loggedByYou}</p>
        )}
      </div>
      {markable && client.attendance !== 'CANCELLED' ? (
        <div
          role="group"
          aria-label={`${copy.attendance}: ${client.name}`}
          className="flex shrink-0 gap-2"
        >
          {(['ATTENDED', 'NO_SHOW'] as const).map((status) => {
            const active = client.attendance === status;
            return (
              <button
                key={status}
                type="button"
                aria-pressed={active}
                disabled={busy || booking.cancelledAt !== null}
                onClick={() => onMark(active ? 'SCHEDULED' : status)}
                className={cn(
                  'flex min-h-11 items-center rounded-full border px-4 text-sm font-medium disabled:opacity-50',
                  active
                    ? status === 'ATTENDED'
                      ? 'border-emerald-700 bg-emerald-700 text-white'
                      : 'border-gray-900 bg-gray-900 text-white'
                    : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50',
                  // MO-01 press feedback.
                  pressControl,
                )}
              >
                {ATTENDANCE_TEXT[status]}
              </button>
            );
          })}
        </div>
      ) : (
        <Badge
          variant="secondary"
          className="self-start sm:self-auto"
          data-testid="booking-attendance"
        >
          {ATTENDANCE_TEXT[client.attendance]}
        </Badge>
      )}
    </li>
  );
}

function CancelSheet({
  booking,
  open,
  onClose,
}: {
  booking: TrainerBookingDto;
  open: boolean;
  onClose: () => void;
}) {
  const reasonId = useId();
  const [scope, setScope] = useState<BookingScope>('THIS');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const online = useOnline();
  const invalidate = useInvalidateBookings();
  const cancel = trpc.trainer.bookings.cancel.useMutation({
    meta: { silent: true },
    onSuccess: (_res, input) => {
      capture('booking_cancelled', { scope: input.scope ?? 'THIS' });
      invalidate();
      onClose();
    },
    onError: (err) => setError(userFacingErrorMessage(err)),
  });
  const submit = () => {
    setError(null);
    if (!online) {
      setError(BOOKING_COPY.schedule.offline);
      return;
    }
    cancel.mutate({
      bookingId: booking.id,
      scope: booking.seriesId ? scope : 'THIS',
      reason: reason.trim() === '' ? null : reason.trim(),
    });
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={copy.cancelTitle}
      size="sm"
      footer={
        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <Button
            type="button"
            variant="destructive"
            className="min-h-11 sm:flex-1"
            loading={cancel.isPending}
            onClick={submit}
          >
            {copy.cancelConfirm}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 sm:flex-1"
            disabled={cancel.isPending}
            onClick={onClose}
          >
            {copy.keep}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 px-5 py-4">
        {booking.seriesId && (
          <fieldset className="flex flex-col gap-1">
            <legend className="text-sm font-medium text-gray-800">
              {BOOKING_COPY.editor.scopeTitle}
            </legend>
            {(['THIS', 'FOLLOWING'] as const).map((s) => (
              <label key={s} className="flex min-h-11 items-center gap-2 text-sm text-gray-800">
                <input
                  type="radio"
                  name="cancel-scope"
                  className="h-5 w-5"
                  checked={scope === s}
                  onChange={() => setScope(s)}
                />
                {s === 'THIS' ? BOOKING_COPY.editor.thisOnly : BOOKING_COPY.editor.following}
              </label>
            ))}
          </fieldset>
        )}
        {booking.kind === 'BOOKING' && (
          <div className="flex flex-col gap-1">
            <label htmlFor={reasonId} className="text-sm font-medium text-gray-800">
              {copy.cancelReason}
            </label>
            <textarea
              id={reasonId}
              rows={2}
              value={reason}
              maxLength={TRAINER_MODE_LIMITS.noteMaxChars}
              onChange={(e) => setReason(e.target.value)}
              className="w-full min-w-0 rounded-lg border border-gray-200 bg-white px-3 py-2 text-base focus:border-gray-400 focus:outline-none sm:text-sm"
            />
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm font-medium text-red-700">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  );
}

export function BookingDetail({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const timeZone = useMemo(deviceTimeZone, []);
  const now = useNow();
  const utils = trpc.useUtils();
  const invalidate = useInvalidateBookings();
  const [editor, setEditor] = useState<EditorTarget | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [markError, setMarkError] = useState<string | null>(null);
  const query = trpc.trainer.bookings.get.useQuery({ bookingId }, { retry: false });
  const mark = trpc.trainer.bookings.markAttendance.useMutation({
    meta: { silent: true },
    onSuccess: (dto, input) => {
      if (input.attendance !== 'SCHEDULED')
        capture('attendance_marked', { status: input.attendance });
      utils.trainer.bookings.get.setData({ bookingId }, dto);
      invalidate();
    },
    onError: (err) => setMarkError(userFacingErrorMessage(err)),
  });

  const booking = query.data;
  if (query.isError) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
        <h1 className="mb-3 font-serif text-2xl font-bold text-gray-900">{copy.title}</h1>
        <QueryError error={query.error} onRetry={() => void query.refetch()} />
      </div>
    );
  }
  if (!booking) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
        <h1 className="sr-only">{copy.title}</h1>
        <div className="h-48 animate-pulse rounded-2xl bg-gray-100" aria-hidden="true" />
      </div>
    );
  }

  const cancelled = booking.cancelledAt !== null;
  const start = utcToZoned(booking.startsAt, timeZone);
  const zone = bookingZoneHint(booking, timeZone);
  const markable = canMarkAttendance(booking, now);
  const changeable = canChangeBooking(booking, now);
  const isBooking = booking.kind === 'BOOKING';

  return (
    <div
      className={cn(
        'mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6 sm:px-6 sm:py-8',
        cancelled && 'text-gray-500',
      )}
      data-testid="booking-detail"
      data-cancelled={cancelled || undefined}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Link
          href="/trainer/schedule"
          aria-label={BOOKING_COPY.schedule.title}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </Link>
        <h1
          className={cn(
            'min-w-0 break-words font-serif text-2xl font-bold',
            cancelled ? 'text-gray-500 line-through' : 'text-gray-900',
          )}
        >
          {bookingWho(booking)}
        </h1>
        {cancelled && (
          <Badge variant="secondary" data-testid="booking-cancelled">
            {BOOKING_COPY.schedule.cancelled}
          </Badge>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <p className="text-base font-medium text-gray-900" data-testid="booking-when">
          {formatDayWithWeekday(start.date)} · {bookingTimeRange(booking, timeZone)}
        </p>
        {zone && <p className="text-sm italic text-gray-600">{zone}</p>}
        {cancelled && booking.cancelReason && (
          <p
            className="rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-700"
            data-testid="booking-cancel-reason"
          >
            {booking.cancelReason}
          </p>
        )}
      </div>

      {!cancelled && (
        <div className="flex flex-wrap items-start gap-2">
          {isBooking && <StartButton booking={booking} now={now} />}
          {changeable && (
            <>
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                onClick={() => setEditor({ mode: 'edit', booking })}
              >
                {copy.edit}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                onClick={() => setCancelling(true)}
              >
                {copy.cancel}
              </Button>
            </>
          )}
        </div>
      )}

      {isBooking && booking.clients.length > 0 && (
        <section aria-labelledby="booking-attendance-title" className="flex flex-col gap-2">
          <h2 id="booking-attendance-title" className="font-semibold text-gray-900">
            {copy.attendance}
          </h2>
          <ul className="flex flex-col gap-2">
            {booking.clients.map((c) => (
              <AttendanceRow
                key={c.clientId}
                booking={booking}
                client={c}
                markable={markable}
                busy={mark.isPending}
                onMark={(attendance) => {
                  setMarkError(null);
                  mark.mutate({ bookingId: booking.id, clientId: c.clientId, attendance });
                }}
              />
            ))}
          </ul>
          {markError && (
            <p role="alert" className="text-sm font-medium text-red-700">
              {markError}
            </p>
          )}
        </section>
      )}

      {(booking.location !== null || booking.note !== null) && (
        <dl className="grid grid-cols-1 gap-3 rounded-2xl border bg-white p-4 text-sm sm:grid-cols-[8rem_1fr]">
          {booking.location && (
            <>
              <dt className="font-medium text-gray-600">{BOOKING_COPY.editor.location}</dt>
              <dd className="min-w-0 break-words text-gray-900">{booking.location}</dd>
            </>
          )}
          {booking.note && (
            <>
              <dt className="font-medium text-gray-600">{BOOKING_COPY.editor.note}</dt>
              <dd className="min-w-0 break-words text-gray-900">{booking.note}</dd>
            </>
          )}
        </dl>
      )}

      <BookingEditor
        target={editor}
        onClose={() => setEditor(null)}
        onSaved={(dto) => {
          // "This and following" can make a new booking id; follow it.
          if (dto.id === bookingId) utils.trainer.bookings.get.setData({ bookingId }, dto);
          else router.replace(`/trainer/bookings/${encodeURIComponent(dto.id)}`);
        }}
      />
      <CancelSheet booking={booking} open={cancelling} onClose={() => setCancelling(false)} />
    </div>
  );
}
