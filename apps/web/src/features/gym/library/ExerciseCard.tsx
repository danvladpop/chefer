'use client';

import Link from 'next/link';
import { exerciseImageUrl } from '@/features/gym/use-gym-bootstrap';
import { HIDDEN_EXERCISE_IMAGE_IDS, MUSCLE_LABELS, type ExerciseDto } from '@chefer/types';
import { ExerciseImage } from './ExerciseImage';
import { EQUIPMENT_LABELS } from './filters';

// Grid card on desktop, a compact row on phone (the parent switches the outer
// layout with a responsive grid class; this component's own layout flips at
// `sm` so it works either way — gym_plan.md §1.3 "Grid of cards on desktop,
// list on phone").
//
// T-05.11 (UX-05 A6): the thumbnail is the shared ExerciseImage — 3:2, never
// the square crop this used to force, with a real icon placeholder and one
// silent retry before falling back.

export function ExerciseCard({ exercise }: { exercise: ExerciseDto }) {
  const image = exerciseImageUrl(exercise);
  const muscles = exercise.primaryMuscles.map((m) => MUSCLE_LABELS[m]).join(', ');

  return (
    <Link
      href={`/gym/exercises/${exercise.id}`}
      className="flex min-w-0 items-center gap-3 rounded-2xl border bg-white p-3 shadow-sm transition hover:border-[#944a00]/40 hover:shadow sm:flex-col sm:items-stretch sm:gap-2 sm:p-3"
    >
      <div className="w-20 shrink-0 sm:w-full">
        <ExerciseImage
          uri={image}
          equipment={exercise.equipment}
          name={exercise.name}
          size="thumb"
          hidden={HIDDEN_EXERCISE_IMAGE_IDS.has(exercise.id)}
          analyticsExerciseId={exercise.ownerId ? 'custom' : exercise.id}
          className="rounded-xl"
        />
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
