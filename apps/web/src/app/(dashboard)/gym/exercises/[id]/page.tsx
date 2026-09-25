'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { ExerciseE1rmChart } from '@/features/gym/library/ExerciseE1rmChart';
import { ExerciseNoteEditor } from '@/features/gym/library/ExerciseNoteEditor';
import { PhotoCrossfade } from '@/features/gym/library/PhotoCrossfade';
import { VideoEmbed } from '@/features/gym/library/VideoEmbed';
import { exerciseImageUrl, useGymBootstrap } from '@/features/gym/use-gym-bootstrap';
import { useHasMounted } from '@/hooks/useHasMounted';
import { trpc } from '@/lib/trpc';
import { format, parseISO } from 'date-fns';
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import { MUSCLE_LABELS } from '@chefer/types';
import { formatLoad } from '@chefer/utils';

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-neutral-500">
        {title}
      </p>
      {children}
    </div>
  );
}

export default function GymExerciseDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const hasMounted = useHasMounted();
  const [confirmingArchive, setConfirmingArchive] = useState(false);

  const { data: exercise, isLoading, error } = trpc.gym.library.get.useQuery({ id });
  const { data: bootstrap } = useGymBootstrap();
  const { data: repPrs } = trpc.gym.stats.repPrs.useQuery(
    { exerciseId: id },
    { enabled: !!exercise },
  );

  const utils = trpc.useUtils();
  const archiveMutation = trpc.gym.library.archiveCustom.useMutation({
    onSuccess: () => {
      void utils.gym.bootstrap.invalidate();
      void utils.gym.library.invalidate();
      router.push('/gym/exercises');
    },
  });

  const unit = bootstrap?.profile?.unit ?? 'KG';
  const recentSessions = (bootstrap?.recentSessions ?? [])
    .filter((s) => s.exercises.some((e) => e.exerciseId === id && !e.skipped))
    .slice(0, 5);

  if (!hasMounted || isLoading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6 sm:py-8">
        <div className="h-64 animate-pulse rounded-2xl bg-neutral-100" />
      </div>
    );
  }

  if (error || !exercise) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10 text-center">
        <p className="text-sm text-neutral-500">Exercise not found.</p>
        <Link
          href="/gym/exercises"
          className="mt-2 inline-block text-sm text-[#944a00] hover:underline"
        >
          Back to exercises
        </Link>
      </div>
    );
  }

  const isCustom = exercise.ownerId !== null;
  const imageUrls = exercise.images
    .map((_, i) => exerciseImageUrl(exercise, i))
    .filter((u): u is string => u !== null);

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:py-8">
      <Link
        href="/gym/exercises"
        className="mb-4 flex min-h-11 w-fit items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-800"
      >
        <ArrowLeft className="h-4 w-4" />
        Exercises
      </Link>

      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold text-neutral-900">{exercise.name}</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {exercise.primaryMuscles.map((m) => MUSCLE_LABELS[m]).join(', ')}
          </p>
        </div>
        {isCustom && (
          <div className="flex shrink-0 gap-2">
            <Link
              href={`/gym/exercises/${id}/edit`}
              className="flex min-h-11 items-center gap-1.5 rounded-xl border border-neutral-200 px-3 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Link>
            <button
              type="button"
              onClick={() => setConfirmingArchive(true)}
              className="flex min-h-11 items-center gap-1.5 rounded-xl border border-red-200 px-3 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Archive
            </button>
          </div>
        )}
      </div>

      {confirmingArchive && (
        <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-800">
            Archive &ldquo;{exercise.name}&rdquo;? It disappears from the library, but past sessions
            keep their history.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => archiveMutation.mutate({ id })}
              disabled={archiveMutation.isPending}
              className="min-h-9 rounded-lg bg-red-600 px-3 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {archiveMutation.isPending ? 'Archiving…' : 'Archive it'}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingArchive(false)}
              className="min-h-9 rounded-lg border border-neutral-200 px-3 text-sm text-neutral-600 hover:bg-neutral-100"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Media */}
        <div className="space-y-4">
          <PhotoCrossfade images={imageUrls} alt={exercise.name} />
          {exercise.videoId && (
            <VideoEmbed
              videoId={exercise.videoId}
              startSec={exercise.videoStartSec}
              channel={exercise.videoChannel}
            />
          )}
        </div>

        {/* Cues */}
        <div className="space-y-4">
          {exercise.blurb && (
            <SectionCard title="Why it's in your program">
              <p className="text-sm text-neutral-700">{exercise.blurb}</p>
            </SectionCard>
          )}
          {exercise.cues.length > 0 && (
            <SectionCard title="Focus on">
              <ul className="space-y-1.5">
                {exercise.cues.map((cue, i) => (
                  <li key={i} className="flex gap-2 text-sm text-neutral-700">
                    <span className="text-emerald-600">✓</span>
                    {cue}
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}
          {exercise.mistakes.length > 0 && (
            <SectionCard title="Avoid">
              <ul className="space-y-1.5">
                {exercise.mistakes.map((mistake, i) => (
                  <li key={i} className="flex gap-2 text-sm text-neutral-700">
                    <span className="text-red-500">✕</span>
                    {mistake}
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}
          <SectionCard title="Muscles worked">
            <div className="flex flex-wrap gap-1.5">
              {exercise.primaryMuscles.map((m) => (
                <span
                  key={m}
                  className="rounded-full bg-[#944a00]/10 px-2.5 py-1 text-xs font-medium text-[#944a00]"
                >
                  {MUSCLE_LABELS[m]}
                </span>
              ))}
              {exercise.secondaryMuscles.map((m) => (
                <span
                  key={m}
                  className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-600"
                >
                  {MUSCLE_LABELS[m]}
                </span>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>

      {/* Your history */}
      <div className="mt-6">
        <h2 className="mb-3 font-serif text-lg font-bold text-neutral-900">Your history</h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ExerciseE1rmChart exerciseId={id} />

          <SectionCard title="Rep PRs">
            {!repPrs || repPrs.length === 0 ? (
              <p className="text-sm text-neutral-500">No completed sets yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-neutral-400">
                    <th className="pb-1.5 font-medium">Weight</th>
                    <th className="pb-1.5 font-medium">Best reps</th>
                    <th className="pb-1.5 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {repPrs.map((row) => (
                    <tr key={row.weightKg} className="border-t border-neutral-100">
                      <td className="py-1.5 font-medium text-neutral-900">
                        {formatLoad(row.weightKg, unit)}
                      </td>
                      <td className="py-1.5 text-neutral-700">{row.reps}</td>
                      <td className="py-1.5 text-neutral-500">
                        {format(parseISO(row.localDate), 'd MMM yyyy')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </SectionCard>

          <SectionCard title="Last sessions">
            {recentSessions.length === 0 ? (
              <p className="text-sm text-neutral-500">No sessions with this exercise yet.</p>
            ) : (
              <ul className="space-y-2">
                {recentSessions.map((session) => {
                  const ex = session.exercises.find((e) => e.exerciseId === id);
                  const working = (ex?.sets ?? []).filter((s) => !s.isWarmup && s.completed);
                  return (
                    <li key={session.id}>
                      <Link
                        href={`/gym/history/${session.id}`}
                        className="flex min-h-11 items-center justify-between gap-3 rounded-xl px-2 py-1.5 transition hover:bg-neutral-50"
                      >
                        <span className="text-neutral-500">
                          {format(parseISO(session.localDate), 'd MMM')}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-right text-neutral-700">
                          {working
                            .map((s) => `${formatLoad(s.weightKg, unit)}×${s.reps}`)
                            .join(', ') || 'No sets logged'}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </SectionCard>

          <ExerciseNoteEditor exerciseId={id} />
        </div>
      </div>
    </div>
  );
}
