'use client';

import Link from 'next/link';
import { exerciseImageUrl } from '@/features/gym/use-gym-bootstrap';
import { Dumbbell } from 'lucide-react';
import { MUSCLE_LABELS, type ExerciseDto } from '@chefer/types';
import { EQUIPMENT_LABELS } from './filters';

// Grid card on desktop, a compact row on phone (the parent switches the outer
// layout with a responsive grid class; this component's own layout flips at
// `sm` so it works either way — gym_plan.md §1.3 "Grid of cards on desktop,
// list on phone").

export function ExerciseCard({ exercise }: { exercise: ExerciseDto }) {
  const image = exerciseImageUrl(exercise);
  const muscles = exercise.primaryMuscles.map((m) => MUSCLE_LABELS[m]).join(', ');

  return (
    <Link
      href={`/gym/exercises/${exercise.id}`}
      className="flex min-w-0 items-center gap-3 rounded-2xl border bg-white p-3 shadow-sm transition hover:border-[#944a00]/40 hover:shadow sm:flex-col sm:items-stretch sm:gap-2 sm:p-3"
    >
      <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-neutral-100 sm:h-28 sm:w-full">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" className="h-full w-full object-cover" />
        ) : (
          <Dumbbell className="h-6 w-6 text-neutral-300" aria-hidden="true" />
        )}
      </div>
      <div className="min-w-0 flex-1 sm:flex-none">
        <p className="truncate text-sm font-semibold text-neutral-900">{exercise.name}</p>
        <p className="truncate text-xs text-neutral-500">
          {muscles} · {EQUIPMENT_LABELS[exercise.equipment]}
        </p>
        {exercise.ownerId !== null && (
          <span className="mt-1 inline-block rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
            Custom
          </span>
        )}
      </div>
    </Link>
  );
}
