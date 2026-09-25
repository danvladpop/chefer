'use client';

import { useMemo } from 'react';
import { BodyweightPrompt } from '@/features/gym/stats/BodyweightPrompt';
import { ConsistencyGrid } from '@/features/gym/stats/ConsistencyGrid';
import { MonthlyRecapCard } from '@/features/gym/stats/MonthlyRecapCard';
import { MuscleVolumeChart } from '@/features/gym/stats/MuscleVolumeChart';
import { topCompoundsByFrequency } from '@/features/gym/stats/pick-default-exercises';
import { PrTimeline } from '@/features/gym/stats/PrTimeline';
import { StrengthTrendChart } from '@/features/gym/stats/StrengthTrendChart';
import { useGymBootstrap } from '@/features/gym/use-gym-bootstrap';
import { useHasMounted } from '@/hooks/useHasMounted';

function StatsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-64 animate-pulse rounded-2xl bg-neutral-100 lg:col-span-2" />
      ))}
    </div>
  );
}

export default function GymStatsPage() {
  const hasMounted = useHasMounted();
  const { data: bootstrap, isLoading } = useGymBootstrap();

  const experience = bootstrap?.profile?.experience ?? 'INTERMEDIATE';
  const unit = bootstrap?.profile?.unit ?? 'KG';

  const defaultExerciseIds = useMemo(
    () => topCompoundsByFrequency(bootstrap?.recentSessions ?? [], bootstrap?.library ?? []),
    [bootstrap?.recentSessions, bootstrap?.library],
  );

  if (!hasMounted || isLoading || !bootstrap) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
        <StatsSkeleton />
      </div>
    );
  }

  const hasAnyHistory = bootstrap.recentSessions.length > 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">GYM</p>
        <h1 className="mt-1 font-serif text-2xl font-bold text-neutral-900">Stats</h1>
      </div>

      {!hasAnyHistory ? (
        <div className="rounded-2xl border bg-white p-8 text-center text-sm text-neutral-500">
          Finish your first workout to start seeing your strength trend, weekly volume and streak
          here.
        </div>
      ) : (
        <div className="space-y-4">
          {bootstrap.bodyweightKg === null && <BodyweightPrompt />}

          <StrengthTrendChart library={bootstrap.library} defaultExerciseIds={defaultExerciseIds} />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <MuscleVolumeChart experience={experience} />
            <ConsistencyGrid />
            <PrTimeline library={bootstrap.library} unit={unit} />
            <MonthlyRecapCard library={bootstrap.library} unit={unit} />
          </div>
        </div>
      )}
    </div>
  );
}
