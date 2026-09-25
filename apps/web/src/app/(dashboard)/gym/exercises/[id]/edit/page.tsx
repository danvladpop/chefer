'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ExerciseForm } from '@/features/gym/library/ExerciseForm';
import { useHasMounted } from '@/hooks/useHasMounted';
import { trpc } from '@/lib/trpc';
import { ArrowLeft } from 'lucide-react';
import type { CustomExerciseInput } from '@chefer/types';

export default function EditCustomExercisePage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const hasMounted = useHasMounted();
  const { data: exercise, isLoading, error } = trpc.gym.library.get.useQuery({ id });

  if (!hasMounted || isLoading) {
    return (
      <div className="mx-auto max-w-lg px-4 py-6 sm:py-8">
        <div className="h-96 animate-pulse rounded-2xl bg-neutral-100" />
      </div>
    );
  }

  if (error || !exercise?.ownerId) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10 text-center">
        <p className="text-sm text-neutral-500">
          {exercise?.ownerId === null
            ? 'Only custom exercises can be edited.'
            : 'Exercise not found.'}
        </p>
        <Link
          href="/gym/exercises"
          className="mt-2 inline-block text-sm text-[#944a00] hover:underline"
        >
          Back to exercises
        </Link>
      </div>
    );
  }

  const initial: CustomExerciseInput = {
    name: exercise.name,
    category: exercise.category,
    equipment: exercise.equipment,
    loadType: exercise.loadType,
    primaryMuscles: exercise.primaryMuscles,
    secondaryMuscles: exercise.secondaryMuscles,
    repMin: exercise.repMin,
    repMax: exercise.repMax,
    restSec: exercise.restSec,
    isTimed: exercise.isTimed,
    cues: exercise.cues,
  };

  return (
    <div className="mx-auto max-w-lg px-4 py-6 sm:py-8">
      <Link
        href={`/gym/exercises/${id}`}
        className="mb-4 flex min-h-11 w-fit items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-800"
      >
        <ArrowLeft className="h-4 w-4" />
        {exercise.name}
      </Link>
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">GYM</p>
        <h1 className="mt-1 font-serif text-2xl font-bold text-neutral-900">Edit exercise</h1>
      </div>
      <ExerciseForm mode="edit" exerciseId={id} initial={initial} />
    </div>
  );
}
