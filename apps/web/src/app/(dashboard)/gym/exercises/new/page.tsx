'use client';

import Link from 'next/link';
import { ExerciseForm } from '@/features/gym/library/ExerciseForm';
import { ArrowLeft } from 'lucide-react';

export default function NewCustomExercisePage() {
  return (
    <div className="mx-auto max-w-lg px-4 py-6 sm:py-8">
      <Link
        href="/gym/exercises"
        className="mb-4 flex min-h-11 w-fit items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-800"
      >
        <ArrowLeft className="h-4 w-4" />
        Exercises
      </Link>
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">GYM</p>
        <h1 className="mt-1 font-serif text-2xl font-bold text-neutral-900">
          Create custom exercise
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Only you will see this exercise. No media — your own cues are optional.
        </p>
      </div>
      <ExerciseForm mode="create" />
    </div>
  );
}
