'use client';

import { useMemo, useState } from 'react';
import { exerciseImageUrl } from '@/features/gym/use-gym-bootstrap';
import { Search } from 'lucide-react';
import type { ExerciseDto, VolumeGroup } from '@chefer/types';
import { Badge, Sheet } from '@chefer/ui';
import { cn, VOLUME_GROUP_LABELS } from '@chefer/utils';
import { filterExercises, sortBySwapGroupFirst } from '../exercise-filter';

const GROUPS = Object.keys(VOLUME_GROUP_LABELS) as VolumeGroup[];

export interface ExercisePickerSheetProps {
  open: boolean;
  onClose: () => void;
  library: ExerciseDto[];
  onPick: (exercise: ExerciseDto) => void;
  title?: string;
  /** Exercises sharing this swap group are listed first ("Similar" swaps). */
  preferSwapGroup?: string | null | undefined;
  /** Hidden from the list (e.g. the exercise already in the slot being swapped). */
  excludeIds?: readonly string[] | undefined;
}

export function ExercisePickerSheet({
  open,
  onClose,
  library,
  onPick,
  title = 'Choose an exercise',
  preferSwapGroup,
  excludeIds,
}: ExercisePickerSheetProps) {
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<VolumeGroup | null>(null);

  const rows = useMemo(() => {
    const filtered = filterExercises(library, { query, group, excludeIds });
    if (query || group) return filtered;
    return sortBySwapGroupFirst(filtered, preferSwapGroup);
  }, [library, query, group, excludeIds, preferSwapGroup]);

  const handlePick = (exercise: ExerciseDto) => {
    onPick(exercise);
    setQuery('');
    setGroup(null);
  };

  return (
    <Sheet open={open} onClose={onClose} title={title} size="lg">
      <div className="flex flex-col gap-3 px-5 pb-2 pt-1">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
            aria-hidden="true"
          />
          <input
            autoFocus
            type="search"
            aria-label="Search exercises"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search exercises"
            className="h-11 w-full rounded-lg border border-gray-200 pl-9 pr-3 text-base focus:border-gray-400 focus:outline-none sm:h-10 sm:text-sm"
          />
        </div>

        <div
          role="group"
          aria-label="Muscle group"
          className="-mx-1 flex flex-wrap gap-1.5 overflow-x-auto px-1 pb-1"
        >
          <button
            type="button"
            aria-pressed={group === null}
            onClick={() => setGroup(null)}
            className={cn(
              'min-h-11 shrink-0 rounded-full border px-3 text-xs font-medium transition-colors',
              group === null
                ? 'border-gray-900 bg-gray-900 text-white'
                : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50',
            )}
          >
            All
          </button>
          {GROUPS.map((g) => (
            <button
              key={g}
              type="button"
              aria-pressed={group === g}
              onClick={() => setGroup((current) => (current === g ? null : g))}
              className={cn(
                'min-h-11 shrink-0 rounded-full border px-3 text-xs font-medium transition-colors',
                group === g
                  ? 'border-gray-900 bg-gray-900 text-white'
                  : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50',
              )}
            >
              {VOLUME_GROUP_LABELS[g]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col divide-y divide-gray-100 px-2 pb-4">
        {rows.length === 0 && (
          <p className="px-3 py-8 text-center text-sm text-gray-400">No exercises match.</p>
        )}
        {rows.map((exercise) => {
          const image = exerciseImageUrl(exercise);
          const isSimilar = preferSwapGroup != null && exercise.swapGroup === preferSwapGroup;
          return (
            <button
              key={exercise.id}
              type="button"
              onClick={() => handlePick(exercise)}
              className="flex min-h-14 w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-gray-50"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gray-100">
                {image ? (
                  // eslint-disable-next-line @next/next/no-img-element -- picker thumbnails, dozens per open; next/image adds no benefit here
                  <img src={image} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-lg" aria-hidden="true">
                    🏋️
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900">{exercise.name}</p>
                <p className="truncate text-xs text-gray-400">
                  {exercise.primaryMuscles.map((m) => m.replace('-', ' ')).join(', ')}
                </p>
              </div>
              {isSimilar && (
                <Badge variant="secondary" className="shrink-0">
                  Similar
                </Badge>
              )}
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}
