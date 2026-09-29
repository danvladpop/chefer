'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { GymSkeleton } from '../shared/gym-card';
import { useGymData } from '../shared/use-gym-data';
import { HistoryList } from './HistoryList';

export function HistoryPage() {
  const { data, ready, isError } = useGymData();
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:py-8">
      <Link
        href="/gym"
        className="mb-4 flex min-h-11 w-fit items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-800"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Today
      </Link>
      <h1 className="mb-5 font-serif text-2xl font-bold text-neutral-900">Workout history</h1>
      {isError ? (
        <p className="text-sm text-gray-600">
          Couldn&apos;t load your workouts. Try again shortly.
        </p>
      ) : !ready || !data ? (
        <GymSkeleton rows={3} />
      ) : (
        <HistoryList data={data} />
      )}
    </div>
  );
}
