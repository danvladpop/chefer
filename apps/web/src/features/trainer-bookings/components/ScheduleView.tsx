'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { QueryError } from '@/features/trainer-mode/components/QueryError';
import { showAppToast } from '@/lib/app-toast';
import { useT } from '@/lib/i18n';
import { trpc } from '@/lib/trpc';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import type { Translator } from '@chefer/i18n';
import type { BookingScope, TrainerBookingDto } from '@chefer/types';
import { Button, pressControl } from '@chefer/ui';
import {
  addDaysLocal,
  bookingWeekRange,
  cn,
  deviceTimeZone,
  moveBookingPatch,
  newBookingSlot,
  scheduleWeekDates,
  userFacingErrorMessage,
  utcToZoned,
  weekStartOf,
} from '@chefer/utils';
import { dayLabel } from '../lib/schedule-layout';
import { useInvalidateBookings, useNow, useOnline } from '../use-bookings';
import { BookingEditor, type EditorTarget } from './BookingEditor';
import { ScheduleGrid } from './ScheduleGrid';
import { ScopeSheet } from './ScopeChoice';

// ─── Schedule (trainer-mode.md §6.2) ──────────────────────────────────────────
// Week (default from sm) and Day (default below sm) over ONE `trainer.bookings.range`
// call per visible week (§12): the day view reads the same cached week, so
// switching views is free. Cached data stays on screen offline with "Last
// updated"; creating and moving need a connection.

/** Not in the shared deck yet (reported to the parent). */
type View = 'week' | 'day';

interface PendingMove {
  booking: TrainerBookingDto;
  date: string;
  time: string;
}

function weekTitle(tr: Translator, weekStart: string): string {
  const end = addDaysLocal(weekStart, 6);
  return tr.t('trainer.format.range', {
    start: dayLabel(tr, weekStart, 'short'),
    end: dayLabel(tr, end, 'short'),
  });
}

function segmentCls(active: boolean) {
  return cn(
    'flex min-h-11 min-w-16 items-center justify-center rounded-full px-4 text-sm font-medium',
    active ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-100',
    // MO-01 press feedback.
    pressControl,
  );
}

export function ScheduleView() {
  const router = useRouter();
  const tr = useT();
  const { t } = tr;
  const timeZone = useMemo(deviceTimeZone, []);
  const now = useNow();
  const zonedNow = utcToZoned(now, timeZone);
  const today = zonedNow.date;
  const online = useOnline();
  const invalidate = useInvalidateBookings();

  const [view, setView] = useState<View | null>(null);
  const [anchor, setAnchor] = useState(today);
  const [editor, setEditor] = useState<EditorTarget | null>(null);
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);

  // §12: Week view on wider screens, Day view below sm.
  useEffect(() => {
    setView(window.matchMedia('(min-width: 640px)').matches ? 'week' : 'day');
  }, []);

  const weekStart = weekStartOf(anchor);
  const range = trpc.trainer.bookings.range.useQuery(bookingWeekRange(weekStart, timeZone), {
    retry: false,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });
  const bookings = range.data?.bookings ?? [];

  const update = trpc.trainer.bookings.update.useMutation({
    meta: { silent: true },
    onSettled: () => invalidate(),
    onError: (err) => showAppToast({ message: userFacingErrorMessage(err) }),
  });

  const move = (booking: TrainerBookingDto, date: string, time: string) => {
    if (!online) {
      showAppToast({ message: t('trainer.bookings.schedule.offline') });
      return;
    }
    if (booking.seriesId) setPendingMove({ booking, date, time });
    else commitMove({ booking, date, time }, 'THIS');
  };
  const commitMove = (m: PendingMove, scope: BookingScope) => {
    update.mutate(
      {
        bookingId: m.booking.id,
        expectedVersion: m.booking.version,
        scope,
        patch: moveBookingPatch(m.date, m.time, timeZone),
      },
      { onSettled: () => setPendingMove(null) },
    );
  };

  const step = view === 'day' ? 1 : 7;
  const dates = view === 'day' ? [anchor] : scheduleWeekDates(weekStart);
  const lastUpdated =
    !online && range.data && range.dataUpdatedAt > 0
      ? t('trainer.bookings.schedule.lastUpdated', {
          time: utcToZoned(new Date(range.dataUpdatedAt), timeZone).time,
        })
      : null;
  const live = bookings.filter((b) => !b.cancelledAt);

  const addBooking = () => {
    const slot = newBookingSlot(anchor, now, timeZone);
    setEditor({ mode: 'create', ...slot });
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-2xl font-bold text-gray-900">
          {t('trainer.bookings.schedule.title')}
        </h1>
        <Button type="button" className="min-h-11" onClick={addBooking}>
          <Plus className="h-4 w-4" aria-hidden="true" /> {t('trainer.bookings.schedule.add')}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div
          role="group"
          aria-label={t('trainer.bookings.schedule.view')}
          className="flex rounded-full border bg-white p-0.5"
          data-testid="schedule-view-toggle"
        >
          {(['week', 'day'] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={segmentCls(view === v)}
            >
              {v === 'week'
                ? t('trainer.bookings.schedule.week')
                : t('trainer.bookings.schedule.day')}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label={
              view === 'day'
                ? t('trainer.bookings.schedule.previousDay')
                : t('trainer.bookings.schedule.previousWeek')
            }
            onClick={() => setAnchor(addDaysLocal(anchor, -step))}
            className={cn(
              'flex h-11 w-11 items-center justify-center rounded-full text-gray-700 hover:bg-gray-100',
              pressControl,
            )}
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => setAnchor(today)}
            disabled={view === 'day' ? anchor === today : weekStart === weekStartOf(today)}
          >
            {t('trainer.bookings.schedule.today')}
          </Button>
          <button
            type="button"
            aria-label={
              view === 'day'
                ? t('trainer.bookings.schedule.nextDay')
                : t('trainer.bookings.schedule.nextWeek')
            }
            onClick={() => setAnchor(addDaysLocal(anchor, step))}
            className={cn(
              'flex h-11 w-11 items-center justify-center rounded-full text-gray-700 hover:bg-gray-100',
              pressControl,
            )}
          >
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <h2
          className="min-w-0 text-sm font-semibold text-gray-900"
          aria-live="polite"
          data-testid="schedule-range-title"
        >
          {view === 'day' ? dayLabel(tr, anchor) : weekTitle(tr, weekStart)}
        </h2>
      </div>

      {view === 'day' && (
        <div
          role="group"
          aria-label={t('trainer.bookings.schedule.days')}
          className="-mx-1 flex gap-1 overflow-x-auto px-1"
          data-testid="schedule-day-strip"
        >
          {scheduleWeekDates(weekStart).map((date) => {
            const weekday = dayLabel(tr, date, 'weekday');
            const day = Number(date.slice(8, 10));
            const count = live.filter((b) => utcToZoned(b.startsAt, timeZone).date === date).length;
            return (
              <button
                key={date}
                type="button"
                aria-pressed={date === anchor}
                aria-current={date === today ? 'date' : undefined}
                aria-label={dayLabel(tr, date)}
                onClick={() => setAnchor(date)}
                className={cn(
                  'flex min-h-14 min-w-11 flex-1 flex-col items-center justify-center rounded-xl border px-2 text-xs',
                  date === anchor
                    ? 'border-gray-900 bg-gray-900 text-white'
                    : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50',
                  date === today && date !== anchor && 'border-[#944a00] text-[#944a00]',
                  pressControl,
                )}
              >
                <span>{weekday}</span>
                <span className="text-sm font-semibold">{day}</span>
                <span
                  aria-hidden="true"
                  className={cn(
                    'mt-0.5 h-1 w-1 rounded-full',
                    count > 0 ? 'bg-current' : 'bg-transparent',
                  )}
                />
              </button>
            );
          })}
        </div>
      )}

      {!online && (
        <p role="status" className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {t('trainer.bookings.schedule.offline')}
          {lastUpdated && <span className="block text-xs">{lastUpdated}</span>}
        </p>
      )}

      {range.isError && !range.data ? (
        <QueryError error={range.error} onRetry={() => void range.refetch()} />
      ) : view === null || (range.isLoading && !range.data) ? (
        <div className="h-96 animate-pulse rounded-2xl bg-gray-100" aria-hidden="true" />
      ) : (
        <>
          {live.filter((b) => dates.includes(utcToZoned(b.startsAt, timeZone).date)).length ===
            0 && (
            <p className="text-sm text-gray-600" data-testid="schedule-empty">
              {t('trainer.bookings.schedule.empty')}
            </p>
          )}
          <ScheduleGrid
            dates={dates}
            bookings={bookings}
            timeZone={timeZone}
            today={today}
            nowMinute={zonedNow.minuteOfDay}
            scrollKey={`${view}:${view === 'day' ? anchor : weekStart}`}
            onCreate={(slot) => setEditor({ mode: 'create', ...slot })}
            onOpen={(b) => router.push(`/trainer/bookings/${encodeURIComponent(b.id)}`)}
            onMove={move}
            {...(view === 'week'
              ? {
                  onPickDay: (date: string) => {
                    setAnchor(date);
                    setView('day');
                  },
                }
              : {})}
          />
        </>
      )}

      <BookingEditor target={editor} onClose={() => setEditor(null)} />
      <ScopeSheet
        open={pendingMove !== null}
        busy={update.isPending}
        onClose={() => setPendingMove(null)}
        onPick={(scope) => pendingMove && commitMove(pendingMove, scope)}
      />
    </div>
  );
}
