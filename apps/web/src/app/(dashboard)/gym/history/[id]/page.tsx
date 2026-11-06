'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { SessionOptionsMenu } from '@/features/gym/history/SessionOptionsMenu';
import { useDeleteWorkout } from '@/features/gym/history/use-delete-workout';
import { cardioSetText, isCardioExercise, profileDistanceUnit } from '@/features/gym/shared/cardio';
import { weekdayDateLabelT } from '@/features/gym/shared/format';
import { libraryLookup, useGymBootstrap } from '@/features/gym/use-gym-bootstrap';
import { useHasMounted } from '@/hooks/useHasMounted';
import { useT } from '@/lib/i18n';
import { trpc } from '@/lib/trpc';
import { parseISO } from 'date-fns';
import { ArrowLeft, Clock } from 'lucide-react';
import { BOOKING_COPY } from '@chefer/types';
import { ErrorState } from '@chefer/ui';
import {
  effortLabelForRpe,
  formatLoad,
  isLoggedWorkout,
  isNotFoundError,
  loggedWorkoutFacts,
  loggedWorkoutSummaryLine,
  toSessionSummary,
} from '@chefer/utils';

function durationMinutes(startedAt: string, finishedAt: string | null): number | null {
  if (!finishedAt) return null;
  const mins = Math.round(
    (new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 60_000,
  );
  return mins > 0 ? mins : null;
}

export default function GymHistoryDetailPage() {
  const { t, date } = useT();
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const hasMounted = useHasMounted();

  const {
    data: session,
    isLoading,
    error,
    refetch,
    isRefetching,
  } = trpc.gym.session.get.useQuery({ id });
  const { data: bootstrap } = useGymBootstrap();

  // UX-44 (T-44.5): delete = a named confirm, then an 8 s Undo toast that
  // outlives this page (the delete is held in the outbox, not in this component).
  const { ask: askDelete, sheet: deleteSheet } = useDeleteWorkout({
    bootstrap,
    source: 'detail',
    onDeleted: () => router.push('/gym'),
  });

  const unit = bootstrap?.profile?.unit ?? 'KG';
  const distanceUnit = profileDistanceUnit(bootstrap?.profile);
  const lookup = bootstrap ? libraryLookup(bootstrap) : () => undefined;

  if (!hasMounted || isLoading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6 sm:py-8">
        <div className="h-64 animate-pulse rounded-2xl bg-neutral-100" />
      </div>
    );
  }

  // UX-GYM-24: a failed load has Retry — only a real NOT_FOUND says "not found".
  if (error && !isNotFoundError(error)) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10" data-testid="gym-history-detail-error">
        <ErrorState
          title={t('gym.session.loadError')}
          onRetry={() => void refetch()}
          retrying={isRefetching}
        />
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 text-center">
        <p className="text-sm text-neutral-500">{t('gym.session.notFound')}</p>
        <Link
          href="/gym/exercises"
          className="mt-2 inline-block text-sm text-[#944a00] hover:underline"
        >
          {t('gym.session.backToExercises')}
        </Link>
      </div>
    );
  }

  const durationMin = durationMinutes(session.startedAt, session.finishedAt);
  const duration = durationMin !== null ? t('common.counts.minutes', { count: durationMin }) : null;
  const sessionDate = parseISO(session.localDate);
  // Trainer mode M3: a coached workout ("Logged by Ana"). `session.get` carries it for any
  // date; the bootstrap summary (12-week window) is the fallback.
  const loggedBy = session.loggedBy ?? bootstrap?.recentSessions.find((s) => s.id === id)?.loggedBy;
  const isActivity = isLoggedWorkout(session);
  const activityEffort = isActivity
    ? session.exercises.flatMap((e) => e.sets).find((x) => x.intensityRpe !== undefined)
        ?.intensityRpe
    : undefined;

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:py-8">
      <button
        type="button"
        onClick={() => router.back()}
        className="mb-4 flex min-h-11 w-fit items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-800"
      >
        <ArrowLeft className="h-4 w-4" />
        {t('common.actions.back')}
      </button>

      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold text-neutral-900">{session.name}</h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-neutral-500">
            {`${date(sessionDate, 'weekday-long')}, ${date(sessionDate, 'full')}`}
            {duration && (
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {duration}
              </span>
            )}
            {session.isDeload && (
              <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700">
                {t('gym.workout.view.deload')}
              </span>
            )}
          </p>
          {loggedBy && (
            <p className="mt-1 text-sm text-neutral-500" data-testid="gym-history-logged-by">
              {BOOKING_COPY.coach.loggedBy(loggedBy.name)}
            </p>
          )}
        </div>
        <SessionOptionsMenu
          testId="gym-history-options"
          label={`${session.name}, ${weekdayDateLabelT(session.localDate, t)}`}
          onDelete={() =>
            askDelete(
              bootstrap?.recentSessions.find((s) => s.id === id) ?? toSessionSummary(session),
            )
          }
        />
      </div>

      <div className="space-y-4">
        {/* WP-20: a quick-logged activity reads "Cycling class · 45 min · ~400 kcal (from your
            watch)" — one line, no sets table. */}
        {isActivity && (
          <div
            className="rounded-2xl border bg-white p-4 shadow-sm"
            data-testid="gym-history-activity"
          >
            <p className="font-medium text-neutral-900">
              {loggedWorkoutSummaryLine(session.name, loggedWorkoutFacts(session))}
            </p>
            {activityEffort !== undefined && (
              <p className="mt-1 text-sm text-neutral-500">
                {t('gym.session.effort', {
                  value: effortLabelForRpe(activityEffort) ?? `RPE ${activityEffort}`,
                })}
              </p>
            )}
          </div>
        )}
        {(isActivity ? [] : session.exercises).map((ex) => {
          const meta = lookup(ex.exerciseId);
          const working = ex.sets.filter((s) => !s.isWarmup);
          const warmups = ex.sets.filter((s) => s.isWarmup);
          // T-42.5: cardio is rendered as time · distance · effort, never "0 kg × 0".
          const cardio = isCardioExercise(meta);
          return (
            <div key={ex.id} className="rounded-2xl border bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-center justify-between gap-2">
                <Link
                  href={`/gym/exercises/${ex.exerciseId}`}
                  className="min-w-0 truncate font-semibold text-neutral-900 hover:underline"
                >
                  {meta?.name ?? ex.exerciseId}
                </Link>
                {ex.skipped && (
                  <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
                    {t('gym.session.skipped')}
                  </span>
                )}
              </div>
              {ex.skipped ? null : cardio ? (
                <div className="flex flex-wrap gap-1.5" data-testid="gym-history-cardio">
                  {working.map((set) => (
                    <span
                      key={set.id}
                      className={`rounded-lg px-2.5 py-1 text-sm ${
                        set.completedAt
                          ? 'bg-neutral-50 text-neutral-800'
                          : 'bg-neutral-50 text-neutral-300 line-through'
                      }`}
                    >
                      {cardioSetText(set, ex.exerciseId, distanceUnit)}
                    </span>
                  ))}
                </div>
              ) : (
                <>
                  {warmups.length > 0 && (
                    <p className="mb-1.5 text-xs text-neutral-400">
                      {t('gym.session.warmupLine', {
                        sets: warmups
                          .map(
                            (s) =>
                              `${formatLoad(s.weightKg, unit, meta?.loadType, { each: meta?.perHand })}×${s.reps}`,
                          )
                          .join(', '),
                      })}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    {working.map((set, i) => (
                      <span
                        key={set.id}
                        className={`rounded-lg px-2.5 py-1 text-sm ${
                          set.completedAt
                            ? 'bg-neutral-50 text-neutral-800'
                            : 'bg-neutral-50 text-neutral-300 line-through'
                        }`}
                      >
                        {formatLoad(set.weightKg, unit, meta?.loadType, { each: meta?.perHand })} ×{' '}
                        {set.reps}
                        {i === working.length - 1 && ex.lastSetRir !== null && (
                          <span className="ml-1 text-xs text-neutral-400">
                            (
                            {t('gym.session.rir', {
                              value: ex.lastSetRir >= 3 ? '3+' : String(ex.lastSetRir),
                            })}
                            )
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                  {ex.notes && <p className="mt-2 text-xs text-neutral-500">{ex.notes}</p>}
                </>
              )}
            </div>
          );
        })}
      </div>

      {session.notes && (
        <div className="mt-4 rounded-2xl border bg-white p-4 text-sm text-neutral-600 shadow-sm">
          {session.notes}
        </div>
      )}

      {deleteSheet}
    </div>
  );
}
