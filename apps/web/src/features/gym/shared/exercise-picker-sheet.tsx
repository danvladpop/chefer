'use client';

/* eslint-disable @next/next/no-img-element -- exercise photos are API-hosted WebPs, not optimisable by next/image */
import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { MUSCLE_LABELS, VOLUME_GROUPS, type ExerciseDto, type VolumeGroup } from '@chefer/types';
import { Input, Sheet } from '@chefer/ui';
import { cn, VOLUME_GROUP_LABELS } from '@chefer/utils';
import { exerciseImageUrl } from '../use-gym-bootstrap';

// Exercise picker (swap / add in the workout). Mirrors the phone's
// apps/mobile/src/features/gym/library/exercise-picker.tsx: search, a muscle
// filter, and same-swap-group alternatives first.

const GROUPS = Object.keys(VOLUME_GROUPS) as VolumeGroup[];

function matchesGroup(exercise: ExerciseDto, group: VolumeGroup): boolean {
  const muscles = VOLUME_GROUPS[group] as readonly string[];
  return exercise.primaryMuscles.some((m) => muscles.includes(m));
}

export function filterExercises(
  library: ExerciseDto[],
  opts: { query: string; group: VolumeGroup | null; excludeIds?: readonly string[] },
): ExerciseDto[] {
  const q = opts.query.trim().toLowerCase();
  return library
    .filter((e) => !e.archived && !(opts.excludeIds ?? []).includes(e.id))
    .filter((e) => (opts.group ? matchesGroup(e, opts.group) : true))
    .filter((e) =>
      q.length === 0
        ? true
        : e.name.toLowerCase().includes(q) || e.aliases.some((a) => a.toLowerCase().includes(q)),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function ExercisePickerSheet({
  open,
  onClose,
  onPick,
  library,
  title = 'Choose an exercise',
  preferSwapGroup = null,
  excludeIds,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (exercise: ExerciseDto) => void;
  library: ExerciseDto[];
  title?: string;
  /** Same-group exercises are listed first under "Similar". */
  preferSwapGroup?: string | null;
  excludeIds?: readonly string[];
}) {
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<VolumeGroup | null>(null);

  const rows = useMemo(() => {
    const all = filterExercises(library, { query, group, ...(excludeIds ? { excludeIds } : {}) });
    if (!preferSwapGroup || query || group) return all;
    return [
      ...all.filter((e) => e.swapGroup === preferSwapGroup),
      ...all.filter((e) => e.swapGroup !== preferSwapGroup),
    ];
  }, [library, query, group, excludeIds, preferSwapGroup]);

  return (
    <Sheet open={open} onClose={onClose} title={title} size="lg">
      <div className="sticky top-0 z-10 space-y-3 bg-white px-5 pb-3">
        <label className="relative block">
          <span className="sr-only">Search exercises</span>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search exercises"
            className="h-11 pl-9"
            data-testid="exercise-picker-search"
          />
        </label>
        <div role="group" aria-label="Muscle group" className="scroll-rail -mx-5 gap-1.5 px-5">
          {GROUPS.map((g) => {
            const on = group === g;
            return (
              <button
                key={g}
                type="button"
                aria-pressed={on}
                onClick={() => setGroup(on ? null : g)}
                className={cn(
                  'min-h-11 shrink-0 snap-start rounded-full border px-3 text-xs font-medium transition-colors',
                  on
                    ? 'border-[#944a00] bg-[#fff3e8] text-[#944a00]'
                    : 'bg-white text-gray-600 hover:bg-gray-50',
                )}
              >
                {VOLUME_GROUP_LABELS[g]}
              </button>
            );
          })}
        </div>
      </div>
      <ul className="pb-3">
        {rows.map((item) => {
          const img = exerciseImageUrl(item);
          const similar = preferSwapGroup !== null && item.swapGroup === preferSwapGroup;
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onPick(item)}
                data-testid={`exercise-picker-item-${item.id}`}
                className="flex min-h-14 w-full items-center gap-3 border-b px-5 py-2 text-left hover:bg-gray-50"
              >
                {img ? (
                  <img
                    src={img}
                    alt=""
                    loading="lazy"
                    className="h-11 w-11 shrink-0 rounded-lg bg-gray-100 object-cover"
                  />
                ) : (
                  <span className="h-11 w-11 shrink-0 rounded-lg bg-gray-100" aria-hidden="true" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-gray-900">
                    {item.name}
                  </span>
                  <span className="block truncate text-xs text-gray-500">
                    {item.primaryMuscles.map((m) => MUSCLE_LABELS[m]).join(', ')} ·{' '}
                    {item.equipment.toLowerCase().replace('_', ' ')}
                    {similar ? ' · similar' : ''}
                    {item.ownerId ? ' · custom' : ''}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
        {rows.length === 0 && (
          <li className="px-5 py-8 text-center text-sm text-gray-500">
            No exercises match. Try another search.
          </li>
        )}
      </ul>
    </Sheet>
  );
}
