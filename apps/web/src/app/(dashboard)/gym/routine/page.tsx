'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { DayCard } from '@/features/gym/routine/components/DayCard';
import {
  OverrideTargetSheet,
  type OverrideTargetSheetTarget,
} from '@/features/gym/routine/components/OverrideTargetSheet';
import { WeeklyBalancePanel } from '@/features/gym/routine/components/WeeklyBalancePanel';
import { libraryLookup, useGymBootstrap } from '@/features/gym/use-gym-bootstrap';
import { useHasMounted } from '@/hooks/useHasMounted';
import { trpc } from '@/lib/trpc';
import { ListChecks } from 'lucide-react';
import { TEMPLATE_BY_KEY, type ProgressionDto } from '@chefer/types';
import { progressionKey, validateRoutine, volumeByGroup } from '@chefer/utils';
import RoutineLoading from './loading';

export default function RoutinePage() {
  const hasMounted = useHasMounted();
  const utils = trpc.useUtils();
  const { data: bootstrap, isLoading } = useGymBootstrap({ enabled: hasMounted });
  const [overrideTarget, setOverrideTarget] = useState<OverrideTargetSheetTarget | null>(null);

  const setOverride = trpc.gym.progression.setOverride.useMutation({
    onSuccess: () => {
      void utils.gym.bootstrap.invalidate();
      setOverrideTarget(null);
    },
  });
  const clearOverride = trpc.gym.progression.clearOverride.useMutation({
    onSuccess: () => {
      void utils.gym.bootstrap.invalidate();
      setOverrideTarget(null);
    },
  });

  const lookup = useMemo(
    () => (bootstrap ? libraryLookup(bootstrap) : () => undefined),
    [bootstrap],
  );
  const progressionByKey = useMemo(() => {
    const map = new Map<string, ProgressionDto>();
    for (const p of bootstrap?.progressions ?? []) {
      map.set(progressionKey(p.exerciseId, p.repBucket), p);
    }
    return map;
  }, [bootstrap]);

  const routine = bootstrap?.activeRoutine ?? null;
  const experience = bootstrap?.profile?.experience ?? 'INTERMEDIATE';
  const suppressLowVolume = routine?.templateKey
    ? (TEMPLATE_BY_KEY.get(routine.templateKey)?.suppressLowVolumeHints ?? false)
    : false;

  const volume = useMemo(
    () => (routine ? volumeByGroup(routine, lookup, experience) : []),
    [routine, lookup, experience],
  );
  const hints = useMemo(
    () => (routine ? validateRoutine(routine, lookup, experience, { suppressLowVolume }) : []),
    [routine, lookup, experience, suppressLowVolume],
  );

  if (!hasMounted || isLoading) return <RoutineLoading />;

  if (!routine) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100 text-3xl">
          🏋️
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-900">No active routine yet</h2>
          <p className="mt-1 max-w-xs text-sm text-gray-500">
            Create one from a template or from scratch to see it here.
          </p>
        </div>
        <Link
          href="/gym/routine/all"
          className="rounded-xl bg-gray-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-gray-700"
        >
          My routines
        </Link>
      </div>
    );
  }

  const unit = bootstrap?.profile?.unit ?? 'KG';

  return (
    <div className="flex h-full flex-col gap-4 px-4 py-4 sm:px-6 sm:py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate font-serif text-xl font-semibold text-gray-900">
            {routine.name}
          </h1>
          {bootstrap?.profile?.weeklyGoal && (
            <p className="text-sm text-gray-500">
              {bootstrap.profile.weeklyGoal} sessions / week goal
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/gym/routine/edit?id=${routine.id}`}
            className="flex min-h-11 items-center gap-1.5 rounded-lg bg-gray-900 px-3.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-gray-700 sm:min-h-9"
          >
            Edit routine
          </Link>
          <Link
            href="/gym/routine/all"
            className="flex min-h-11 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3.5 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 sm:min-h-9"
          >
            <ListChecks className="h-4 w-4" /> My routines
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px] lg:items-start">
        <div className="flex flex-col gap-3">
          {routine.days.map((day) => (
            <DayCard
              key={day.id}
              day={day}
              isNextUp={bootstrap?.nextWorkout?.dayId === day.id}
              unit={unit}
              lookup={lookup}
              progressionByKey={progressionByKey}
              onOpenOverride={setOverrideTarget}
            />
          ))}
        </div>

        <WeeklyBalancePanel
          routineId={routine.id}
          volume={volume}
          hints={hints}
          className="lg:sticky lg:top-4"
        />
      </div>

      <OverrideTargetSheet
        target={overrideTarget}
        unit={unit}
        onClose={() => setOverrideTarget(null)}
        saving={setOverride.isPending || clearOverride.isPending}
        onSave={(weightKg, reps) => {
          if (!overrideTarget) return;
          setOverride.mutate({
            exerciseId: overrideTarget.exerciseId,
            repBucket: overrideTarget.repBucket,
            weightKg,
            reps,
          });
        }}
        onReset={() => {
          if (!overrideTarget) return;
          clearOverride.mutate({
            exerciseId: overrideTarget.exerciseId,
            repBucket: overrideTarget.repBucket,
          });
        }}
      />
    </div>
  );
}
