'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  CoachingNoticeList,
  NoticeCard,
  useCoachingNoticeViews,
} from '@/features/coaching/components/CoachingNoticeList';
import { formatDayWithWeekday } from '@/features/coaching/lib/dates';
import { localDate } from '@/features/gym/use-gym-bootstrap';
import { useOptionalAppMode } from '@/features/nav/mode-context';
import {
  BookingEditor,
  type EditorTarget,
} from '@/features/trainer-bookings/components/BookingEditor';
import {
  NextBookingCard,
  SessionsDelivered,
  TodaysBookings,
  UnmarkedAttendance,
} from '@/features/trainer-bookings/components/TodayBookings';
import { useNow } from '@/features/trainer-bookings/use-bookings';
import { InviteSheet } from '@/features/trainer/components/InviteSheet';
import { trpc } from '@/lib/trpc';
import { CalendarPlus, ChevronRight, UserPlus, UsersRound } from 'lucide-react';
import {
  COACHING_LIMITS,
  QUIET_COPY,
  TRAINER_MODE_COPY,
  TRAINER_MODE_LIMITS,
  type TrainerDashboardSummaryDto,
} from '@chefer/types';
import { Button, buttonVariants, CountUp, pressCard, ProgressRing } from '@chefer/ui';
import { cn, deviceTimeZone, newBookingSlot, utcToZoned } from '@chefer/utils';
import { QueryError } from './QueryError';

// ─── Trainer Today (trainer-mode.md §6.1, M1 + M3) ────────────────────────────
// What needs the trainer now: the requests card, the next booking (Start) and
// the rest of today, this week's numbers, who needs attention (quiet clients,
// past bookings without attendance, client notices) and sessions delivered.
// Polled like `trainer.badges`, so a new request shows here within a minute.

const copy = TRAINER_MODE_COPY.today;

function RequestsCard({ count }: { count: number }) {
  return (
    <section
      aria-label={copy.requestsCard(count)}
      className="flex min-w-0 flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between"
      data-testid="trainer-today-requests"
    >
      <p className="flex min-w-0 items-center gap-2 font-medium text-amber-950">
        <UsersRound className="h-5 w-5 shrink-0" aria-hidden="true" />
        <span className="min-w-0 break-words">{copy.requestsCard(count)}</span>
      </p>
      <Link
        href="/trainer/clients#trainer-requests"
        className={cn(buttonVariants(), 'min-h-11 shrink-0 self-start sm:self-auto')}
      >
        {copy.review}
      </Link>
    </section>
  );
}

function Stat({
  label,
  hint,
  children,
  testId,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <li
      className="flex min-w-0 flex-col gap-1 rounded-2xl border bg-white p-4 shadow-sm"
      data-testid={testId}
    >
      <span className="text-sm font-medium text-gray-600">{label}</span>
      {children}
      {hint && <span className="text-xs text-gray-500">{hint}</span>}
    </li>
  );
}

function ThisWeek({ summary }: { summary: TrainerDashboardSummaryDto }) {
  const adherence = summary.averageAdherence;
  const pct = adherence === null ? null : Math.round(adherence * 100);
  return (
    <section aria-labelledby="trainer-today-week" className="flex flex-col gap-2">
      <h2 id="trainer-today-week" className="font-semibold text-gray-900">
        {copy.thisWeek}
      </h2>
      <ul
        className={cn(
          'grid grid-cols-1 gap-3 sm:grid-cols-3',
          summary.bookingsThisWeek && 'lg:grid-cols-4',
        )}
      >
        <Stat label={copy.activeClients} testId="trainer-stat-active">
          <span className="flex items-baseline gap-1.5">
            {/* MO-06 count-up. */}
            <CountUp value={summary.activeClients} className="text-2xl font-bold text-gray-900" />
            <span className="text-sm text-gray-500">{copy.activeOf(summary.maxClients)}</span>
          </span>
        </Stat>
        {summary.bookingsThisWeek && (
          <Stat label={copy.bookingsThisWeek} testId="trainer-stat-bookings">
            {/* MO-06 count-up on the done number; the line reads "3 done · 5 scheduled". */}
            <CountUp
              value={summary.bookingsThisWeek.done}
              format={(n) =>
                copy.bookingsDone(Math.round(n), summary.bookingsThisWeek?.scheduled ?? 0)
              }
              className="text-sm font-medium text-gray-900"
            />
          </Stat>
        )}
        <Stat label={copy.adherence} hint={copy.adherenceHint} testId="trainer-stat-adherence">
          {pct === null ? (
            <span className="text-sm font-medium text-gray-700">{copy.noAdherence}</span>
          ) : (
            // MO-06: the ring sweeps and the number counts up together.
            <ProgressRing
              progress={adherence ?? 0}
              size={56}
              label={`${copy.adherence}: ${pct}%`}
              className="self-start"
            >
              <CountUp
                value={pct}
                format={(n) => `${Math.round(n)}%`}
                className="text-xs font-semibold text-gray-900"
                aria-hidden="true"
              />
            </ProgressRing>
          )}
        </Stat>
        <Stat
          label={copy.quietClients}
          hint={
            summary.quietAfterDays !== undefined
              ? QUIET_COPY.statHint(summary.quietAfterDays)
              : copy.quietHint(COACHING_LIMITS.inactiveDays)
          }
          testId="trainer-stat-quiet"
        >
          <CountUp
            value={summary.quietClients.length}
            className="text-2xl font-bold text-gray-900"
          />
        </Stat>
      </ul>
    </section>
  );
}

function NeedsAttention({
  summary,
  timeZone,
}: {
  summary: TrainerDashboardSummaryDto;
  timeZone: string;
}) {
  const { views, dismiss } = useCoachingNoticeViews('trainer');
  const quiet = summary.quietClients;
  const unmarked = summary.unmarkedAttendance ?? [];
  return (
    <section aria-labelledby="trainer-today-attention" className="flex flex-col gap-2">
      <h2 id="trainer-today-attention" className="font-semibold text-gray-900">
        {copy.needsAttention}
      </h2>
      {quiet.length === 0 && views.length === 0 && unmarked.length === 0 && (
        <p className="rounded-2xl border bg-white p-4 text-sm text-gray-600">{copy.allCaughtUp}</p>
      )}
      <UnmarkedAttendance bookings={unmarked} timeZone={timeZone} />
      {quiet.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label={copy.quietClients}>
          {quiet.map((client) => (
            <li key={client.clientId}>
              <Link
                href={`/trainer/${encodeURIComponent(client.clientId)}`}
                className={cn(
                  'flex min-h-11 items-center gap-3 rounded-2xl border bg-white p-4 shadow-sm hover:bg-neutral-50',
                  // MO-01 card press.
                  pressCard,
                )}
                data-testid="trainer-today-quiet-row"
              >
                <span className="min-w-0 flex-1">
                  <span className="block min-w-0 break-words font-semibold text-gray-900">
                    {client.name}
                  </span>
                  <span className="block text-sm text-gray-600">
                    {client.lastWorkoutDate
                      ? copy.lastWorkout(formatDayWithWeekday(client.lastWorkoutDate))
                      : copy.noWorkoutYet}
                  </span>
                  <span className="block text-sm font-medium text-amber-800">
                    {summary.quietAfterDays !== undefined
                      ? QUIET_COPY.row(client.inactiveDays)
                      : copy.quietRow(client.inactiveDays)}
                  </span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-gray-400" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {/* The trainer-side coaching notices, moved here from Trainer tools (§6.1). */}
      {views.length > 0 && (
        <ul
          className="flex flex-col gap-2"
          aria-label="Coaching notices"
          data-testid="coaching-notices-trainer"
        >
          {views.map((v) => (
            <NoticeCard key={v.id} notice={v} onDismiss={dismiss} />
          ))}
        </ul>
      )}
    </section>
  );
}

function EmptyState({
  onInvite,
  onAddBooking,
}: {
  onInvite: () => void;
  onAddBooking: () => void;
}) {
  return (
    <section
      aria-labelledby="trainer-today-empty"
      className="flex flex-col gap-3 rounded-2xl border bg-white p-5 shadow-sm sm:p-6"
      data-testid="trainer-today-empty"
    >
      <h2 id="trainer-today-empty" className="font-semibold text-gray-900">
        {copy.emptyTitle}
      </h2>
      <p className="text-sm text-gray-600">{copy.emptyBody}</p>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button type="button" className="min-h-11" onClick={onInvite}>
          <UserPlus className="h-4 w-4" aria-hidden="true" /> {copy.inviteClient}
        </Button>
        {/* Straight into a new template (M2) or the booking editor (M3), as on mobile. */}
        <Link
          href="/trainer/workouts/new"
          className={cn(buttonVariants({ variant: 'outline' }), 'min-h-11')}
        >
          {copy.buildTemplate}
        </Link>
        <Button type="button" variant="outline" className="min-h-11" onClick={onAddBooking}>
          <CalendarPlus className="h-4 w-4" aria-hidden="true" /> {copy.addBooking}
        </Button>
      </div>
    </section>
  );
}

export function TrainerToday() {
  const [inviting, setInviting] = useState(false);
  const [editor, setEditor] = useState<EditorTarget | null>(null);
  const timeZone = useMemo(deviceTimeZone, []);
  const now = useNow();
  const today = utcToZoned(now, timeZone).date;
  const addBooking = () => setEditor({ mode: 'create', ...newBookingSlot(null, now, timeZone) });
  const summary = trpc.trainer.dashboard.summary.useQuery(
    { today: localDate() },
    {
      retry: false,
      staleTime: 30_000,
      refetchInterval: TRAINER_MODE_LIMITS.badgePollMs,
      refetchIntervalInBackground: false,
    },
  );
  const data = summary.data;
  // Lane K4: opening Today is looking at the quiet clients — the Today badge starts over.
  const utils = trpc.useUtils();
  const quietBadge = useOptionalAppMode()?.trainerBadges?.quietClients ?? 0;
  const markSeen = trpc.trainer.quiet.markSeen.useMutation({
    meta: { silent: true },
    onSuccess: () => void utils.trainer.badges.invalidate(),
  });
  const { mutate: markQuietSeen } = markSeen;
  useEffect(() => {
    if (quietBadge > 0) markQuietSeen();
  }, [quietBadge, markQuietSeen]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="font-serif text-2xl font-bold text-gray-900">{copy.title}</h1>

      {summary.isLoading ? (
        <div className="flex flex-col gap-3" aria-hidden="true" data-testid="trainer-today-loading">
          <div className="h-24 animate-pulse rounded-2xl bg-gray-100" />
          <div className="h-32 animate-pulse rounded-2xl bg-gray-100" />
        </div>
      ) : summary.isError || !data ? (
        <QueryError error={summary.error} onRetry={() => void summary.refetch()} />
      ) : (
        <>
          {data.requestsWaiting > 0 && <RequestsCard count={data.requestsWaiting} />}
          {data.activeClients === 0 ? (
            <>
              <EmptyState onInvite={() => setInviting(true)} onAddBooking={addBooking} />
              {/* A trainer whose last client left still sees that notice. */}
              <CoachingNoticeList side="trainer" />
            </>
          ) : (
            <>
              {/* M3 servers send the booking parts; an M1 server leaves them undefined. */}
              {data.nextBooking !== undefined && (
                <NextBookingCard
                  booking={data.nextBooking}
                  timeZone={timeZone}
                  today={today}
                  now={now}
                  onAdd={addBooking}
                />
              )}
              <TodaysBookings bookings={data.todayBookings ?? []} timeZone={timeZone} />
              <ThisWeek summary={data} />
              <NeedsAttention summary={data} timeZone={timeZone} />
              <SessionsDelivered rows={data.sessionsDelivered ?? []} />
            </>
          )}
        </>
      )}

      <InviteSheet open={inviting} onClose={() => setInviting(false)} />
      <BookingEditor target={editor} onClose={() => setEditor(null)} />
    </div>
  );
}
