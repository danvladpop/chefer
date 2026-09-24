'use client';

import type { ProgressionDto, RoutineDayDto, WeightUnit } from '@chefer/types';
import { Badge } from '@chefer/ui';
import {
  estimateDurationMin,
  formatLoad,
  progressionKey,
  repBucket,
  type ExerciseLookup,
} from '@chefer/utils';
import type { OverrideTargetSheetTarget } from './OverrideTargetSheet';

export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export interface DayCardProps {
  day: RoutineDayDto;
  isNextUp: boolean;
  unit: WeightUnit;
  lookup: ExerciseLookup;
  progressionByKey: Map<string, ProgressionDto>;
  onOpenOverride: (target: OverrideTargetSheetTarget) => void;
}

export function DayCard({
  day,
  isNextUp,
  unit,
  lookup,
  progressionByKey,
  onOpenOverride,
}: DayCardProps) {
  const durationMin = estimateDurationMin(day, lookup);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="truncate font-serif text-base font-semibold text-gray-900">{day.name}</h3>
          {isNextUp && (
            <Badge variant="info" className="shrink-0">
              Next up
            </Badge>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2 text-xs text-gray-400">
          {day.plannedWeekday != null && <span>{WEEKDAY_LABELS[day.plannedWeekday]}</span>}
          <span>· ~{durationMin} min</span>
        </div>
      </div>

      <div className="mt-3 flex flex-col divide-y divide-gray-100">
        {day.exercises.length === 0 && (
          <p className="py-3 text-sm text-gray-400">No exercises yet.</p>
        )}
        {day.exercises.map((exercise) => {
          const meta = lookup(exercise.exerciseId);
          const bucket = repBucket(exercise.repMin, exercise.repMax);
          const progression = progressionByKey.get(progressionKey(exercise.exerciseId, bucket));
          const suggestion = progression?.suggestion;
          const edited = progression?.override != null;

          return (
            <div key={exercise.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900">
                  {meta?.name ?? exercise.exerciseId}
                </p>
                <p className="text-xs text-gray-400">
                  {exercise.sets} × {exercise.repMin}–{exercise.repMax}
                </p>
              </div>
              {suggestion && meta ? (
                <button
                  type="button"
                  onClick={() =>
                    onOpenOverride({
                      exerciseId: exercise.exerciseId,
                      repBucket: bucket,
                      exerciseName: meta.name,
                      loadType: meta.loadType,
                      isTimed: meta.isTimed,
                      suggestion,
                      override: progression.override ?? null,
                    })
                  }
                  className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 sm:min-h-9"
                >
                  {formatLoad(suggestion.weightKg, unit, meta.loadType)} ×{' '}
                  {suggestion.reps[0] ?? exercise.repMin}
                  {edited && (
                    <Badge variant="secondary" className="ml-0.5">
                      Edited
                    </Badge>
                  )}
                </button>
              ) : (
                <span className="shrink-0 text-xs text-gray-300">—</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
