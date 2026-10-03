'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { SessionOptionsMenu } from '@/features/gym/history/SessionOptionsMenu';
import { useDeleteWorkout } from '@/features/gym/history/use-delete-workout';
import { cardioSetText, isCardioExercise, profileDistanceUnit } from '@/features/gym/shared/cardio';
import { libraryLookup, useGymBootstrap } from '@/features/gym/use-gym-bootstrap';
import { useHasMounted } from '@/hooks/useHasMounted';
import { trpc } from '@/lib/trpc';
import { format, parseISO } from 'date-fns';
import { ArrowLeft, Clock } from 'lucide-react';
import { formatLoad, toSessionSummary } from '@chefer/utils';

const RIR_LABEL: Record<number, string> = { 0: '0 RIR', 1: '1 RIR', 2: '2 RIR', 3: '3+ RIR' };

function durationLabel(startedAt: string, finishedAt: string | null): string | null {
  if (!finishedAt) return null;
  const mins = Math.round(
    (new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 60_000,
  );
  return mins > 0 ? `${mins} min` : null;
}

export default function GymHistoryDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const hasMounted = useHasMounted();

  const { data: session, isLoading, error } = trpc.gym.session.get.useQuery({ id });
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

  if (error || !session) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 text-center">
        <p className="text-sm text-neutral-500">Session not found.</p>
        <Link
          href="/gym/exercises"
          className="mt-2 inline-block text-sm text-[#944a00] hover:underline"
        >
          Back to exercises
        </Link>
      </div>
    );
  }

  const duration = durationLabel(session.startedAt, session.finishedAt);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:py-8">
      <button
        type="button"
        onClick={() => router.back()}
        className="mb-4 flex min-h-11 w-fit items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-800"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>

      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold text-neutral-900">{session.name}</h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-neutral-500">
            {format(parseISO(session.localDate), 'EEEE, d MMMM yyyy')}
            {duration && (
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {duration}
              </span>
            )}
            {session.isDeload && (
              <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700">
                Deload
              </span>
            )}
          </p>
        </div>
        <SessionOptionsMenu
          testId="gym-history-options"
          label={`${session.name}, ${format(parseISO(session.localDate), 'EEE d MMM')}`}
          onDelete={() =>
            askDelete(
              bootstrap?.recentSessions.find((s) => s.id === id) ?? toSessionSummary(session),
            )
          }
        />
      </div>

      <div className="space-y-4">
        {session.exercises.map((ex) => {
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
                    Skipped
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
                      Warm-up:{' '}
                      {warmups
                        .map(
                          (s) =>
                            `${formatLoad(s.weightKg, unit, 'WEIGHTED', { each: meta?.perHand })}×${s.reps}`,
                        )
                        .join(', ')}
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
                        {formatLoad(set.weightKg, unit, 'WEIGHTED', { each: meta?.perHand })} ×{' '}
                        {set.reps}
                        {i === working.length - 1 && ex.lastSetRir !== null && (
                          <span className="ml-1 text-xs text-neutral-400">
                            ({RIR_LABEL[ex.lastSetRir]})
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
