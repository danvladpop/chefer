'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ExerciseCard } from '@/features/gym/library/ExerciseCard';
import { FilterChip } from '@/features/gym/library/FilterChip';
import {
  DEFAULT_LIBRARY_FILTERS,
  EQUIPMENT_OPTIONS,
  filterExercises,
  MUSCLE_GROUP_OPTIONS,
  type LibraryFilters,
} from '@/features/gym/library/filters';
import { useGymBootstrap } from '@/features/gym/use-gym-bootstrap';
import { useHasMounted } from '@/hooks/useHasMounted';
import { Plus, Search } from 'lucide-react';

function ExercisesSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-20 animate-pulse rounded-2xl bg-neutral-100 sm:h-40" />
      ))}
    </div>
  );
}

export default function GymExercisesPage() {
  const hasMounted = useHasMounted();
  const { data: bootstrap, isLoading } = useGymBootstrap();
  const [filters, setFilters] = useState<LibraryFilters>(DEFAULT_LIBRARY_FILTERS);

  const results = useMemo(
    () => filterExercises(bootstrap?.library ?? [], filters),
    [bootstrap?.library, filters],
  );

  const setQuery = (query: string) => setFilters((f) => ({ ...f, query }));
  const toggleGroup = (value: (typeof MUSCLE_GROUP_OPTIONS)[number]['value']) =>
    setFilters((f) => ({ ...f, muscleGroup: f.muscleGroup === value ? null : value }));
  const toggleEquipment = (value: (typeof EQUIPMENT_OPTIONS)[number]['value']) =>
    setFilters((f) => ({ ...f, equipment: f.equipment === value ? null : value }));
  const toggleMine = () => setFilters((f) => ({ ...f, mineOnly: !f.mineOnly }));

  if (!hasMounted) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
        <ExercisesSkeleton />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">GYM</p>
          <h1 className="mt-1 font-serif text-2xl font-bold text-neutral-900">Exercises</h1>
        </div>
        <Link
          href="/gym/exercises/new"
          className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-[#944a00] px-4 text-sm font-semibold text-white transition hover:bg-[#7a3d00]"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Create custom exercise</span>
          <span className="sm:hidden">New</span>
        </Link>
      </div>

      {/* Search */}
      <div className="relative mb-3">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400"
        />
        <input
          type="search"
          value={filters.query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search exercises"
          aria-label="Search exercises"
          className="min-h-11 w-full rounded-xl border border-neutral-200 bg-white pl-9 pr-3 text-sm focus:border-[#944a00] focus:outline-none focus:ring-1 focus:ring-[#944a00]"
        />
      </div>

      {/* Filter chips */}
      <div
        role="group"
        aria-label="Muscle filters"
        className="mb-2 flex gap-2 overflow-x-auto pb-1"
      >
        <FilterChip active={filters.mineOnly} onClick={toggleMine}>
          Mine
        </FilterChip>
        {MUSCLE_GROUP_OPTIONS.map((opt) => (
          <FilterChip
            key={opt.value}
            active={filters.muscleGroup === opt.value}
            onClick={() => toggleGroup(opt.value)}
          >
            {opt.label}
          </FilterChip>
        ))}
      </div>
      <div
        role="group"
        aria-label="Equipment filters"
        className="mb-5 flex gap-2 overflow-x-auto pb-1"
      >
        {EQUIPMENT_OPTIONS.map((opt) => (
          <FilterChip
            key={opt.value}
            active={filters.equipment === opt.value}
            onClick={() => toggleEquipment(opt.value)}
          >
            {opt.label}
          </FilterChip>
        ))}
      </div>

      {isLoading ? (
        <ExercisesSkeleton />
      ) : results.length === 0 ? (
        <div className="rounded-2xl border bg-white p-8 text-center text-sm text-neutral-500">
          No exercises match. Try another search, or{' '}
          <Link href="/gym/exercises/new" className="text-[#944a00] hover:underline">
            create a custom one
          </Link>
          .
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {results.map((exercise) => (
            <ExerciseCard key={exercise.id} exercise={exercise} />
          ))}
        </div>
      )}
    </div>
  );
}
