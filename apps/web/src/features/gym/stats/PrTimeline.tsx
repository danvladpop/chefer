'use client';

import Link from 'next/link';
import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { format, parseISO } from 'date-fns';
import { Award } from 'lucide-react';
import type { ExerciseDto, PrKind, WeightUnit } from '@chefer/types';
import { formatLoad } from '@chefer/utils';

// Stats tab #4 (gym_plan.md §1.3): a feed of PRs by date, filterable by
// exercise.

const KIND_LABEL: Record<PrKind, string> = { weight: 'Weight PR', reps: 'Rep PR', e1rm: 'e1RM PR' };

export function PrTimeline({ library, unit }: { library: ExerciseDto[]; unit: WeightUnit }) {
  const [exerciseId, setExerciseId] = useState<string>('');
  const { data, isLoading } = trpc.gym.stats.prs.useQuery({
    exerciseId: exerciseId || undefined,
    limit: 50,
  });
  const byId = new Map(library.map((e) => [e.id, e.name]));

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
          PR timeline
        </p>
        <select
          value={exerciseId}
          onChange={(e) => setExerciseId(e.target.value)}
          aria-label="Filter by exercise"
          className="min-h-8 rounded-lg border border-neutral-200 bg-white px-2 text-xs font-medium text-neutral-700"
        >
          <option value="">All exercises</option>
          {library
            .filter((e) => !e.archived)
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
        </select>
      </div>

      {isLoading ? (
        <div className="h-32 animate-pulse rounded-xl bg-neutral-100" />
      ) : !data || data.length === 0 ? (
        <p className="py-6 text-center text-sm text-neutral-500">
          No PRs yet. Every weight, rep or e1RM record shows up here.
        </p>
      ) : (
        <ul className="max-h-80 space-y-1 overflow-y-auto">
          {data.map((pr, i) => (
            <li key={`${pr.sessionId}-${pr.exerciseId}-${i}`}>
              <Link
                href={`/gym/history/${pr.sessionId}`}
                className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-neutral-50"
              >
                <Award className="h-4 w-4 shrink-0 text-amber-500" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-neutral-900">
                    {byId.get(pr.exerciseId) ?? pr.exerciseId}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {KIND_LABEL[pr.kind]} · {formatLoad(pr.weightKg, unit)} × {pr.reps}
                    {pr.e1rmKg !== null ? ` · e1RM ${formatLoad(pr.e1rmKg, unit)}` : ''}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-neutral-400">
                  {format(parseISO(pr.localDate), 'd MMM yyyy')}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
