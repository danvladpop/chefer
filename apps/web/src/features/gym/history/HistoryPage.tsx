'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { ErrorState } from '@chefer/ui';
import { GymSkeleton } from '../shared/gym-card';
import { useGymData } from '../shared/use-gym-data';
import { LogWorkoutSheet } from '../today/log-workout-sheet';
import { HistoryList } from './HistoryList';

export function HistoryPage() {
  const { data, ready, isError, refetch } = useGymData();
  const [logOpen, setLogOpen] = useState(false);
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:py-8">
      <Link
        href="/gym"
        className="mb-4 flex min-h-11 w-fit items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-800"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Today
      </Link>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-x-4">
        <h1 className="font-serif text-2xl font-bold text-neutral-900">Workout history</h1>
        {/* A workout done earlier or elsewhere can be logged from here too (WP-20). */}
        {data?.profile && (
          <button
            type="button"
            data-testid="gym-history-log-workout"
            onClick={() => setLogOpen(true)}
            className="min-h-11 text-sm font-medium text-[#944a00] hover:underline"
          >
            Log a workout
          </button>
        )}
      </div>
      {isError ? (
        <ErrorState title="Couldn’t load your workouts" onRetry={() => void refetch()} />
      ) : !ready || !data ? (
        <GymSkeleton rows={3} />
      ) : (
        <HistoryList data={data} />
      )}
      <LogWorkoutSheet open={logOpen} onClose={() => setLogOpen(false)} />
    </div>
  );
}
