'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  CoachingNoticeList,
  NoticeCard,
  useCoachingNoticeViews,
} from '@/features/coaching/components/CoachingNoticeList';
import { formatDayWithWeekday } from '@/features/coaching/lib/dates';
import { localDate } from '@/features/gym/use-gym-bootstrap';
import { InviteSheet } from '@/features/trainer/components/InviteSheet';
import { trpc } from '@/lib/trpc';
import { ChevronRight, UserPlus, UsersRound } from 'lucide-react';
import {
  COACHING_LIMITS,
  TRAINER_MODE_COPY,
  TRAINER_MODE_LIMITS,
  type TrainerDashboardSummaryDto,
} from '@chefer/types';
import { Button, buttonVariants, CountUp, pressCard, ProgressRing } from '@chefer/ui';
import { cn } from '@chefer/utils';
import { QueryError } from './QueryError';

// ─── Trainer Today (trainer-mode.md §6.1, M1) ─────────────────────────────────
// What needs the trainer now: the requests card, this week's numbers, and who
// needs attention (quiet clients, client notices). Booking parts arrive in M3.
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
            <span className="text-sm font-medium text-gray-900">
              {copy.bookingsDone(summary.bookingsThisWeek.done, summary.bookingsThisWeek.scheduled)}
            </span>
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
          hint={copy.quietHint(COACHING_LIMITS.inactiveDays)}
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

function NeedsAttention({ summary }: { summary: TrainerDashboardSummaryDto }) {
  const { views, dismiss } = useCoachingNoticeViews('trainer');
  const quiet = summary.quietClients;
  return (
    <section aria-labelledby="trainer-today-attention" className="flex flex-col gap-2">
      <h2 id="trainer-today-attention" className="font-semibold text-gray-900">
        {copy.needsAttention}
      </h2>
      {quiet.length === 0 && views.length === 0 && (
        <p className="rounded-2xl border bg-white p-4 text-sm text-gray-600">{copy.allCaughtUp}</p>
      )}
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
                    {copy.quietRow(client.inactiveDays)}
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

function EmptyState({ onInvite }: { onInvite: () => void }) {
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
        {/* Workouts says what is coming until templates ship (M2); "Add a booking" joins with bookings (M3), as on mobile. */}
        <Link
          href="/trainer/workouts"
          className={cn(buttonVariants({ variant: 'outline' }), 'min-h-11')}
        >
          {copy.buildTemplate}
        </Link>
      </div>
    </section>
  );
}

export function TrainerToday() {
  const [inviting, setInviting] = useState(false);
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
              <EmptyState onInvite={() => setInviting(true)} />
              {/* A trainer whose last client left still sees that notice. */}
              <CoachingNoticeList side="trainer" />
            </>
          ) : (
            <>
              <ThisWeek summary={data} />
              <NeedsAttention summary={data} />
            </>
          )}
        </>
      )}

      <InviteSheet open={inviting} onClose={() => setInviting(false)} />
    </div>
  );
}
