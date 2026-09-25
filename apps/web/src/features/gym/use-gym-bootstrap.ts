'use client';

import { env } from '@/lib/env';
import { trpc } from '@/lib/trpc';
import type { ExerciseDto, GymBootstrap } from '@chefer/types';
import type { ExerciseLookup } from '@chefer/utils';

// Web read model for the gym (gym_plan.md G5). Same `gym.bootstrap` query the
// phone persists; on web it is a normal online query (the active workout has
// its own localStorage crash-safety — see features/gym/workout).

/** Browser-local calendar date, "YYYY-MM-DD" (never UTC — weeks follow the user's day). */
export function localDate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function useGymBootstrap(opts: { enabled?: boolean } = {}) {
  return trpc.gym.bootstrap.useQuery(
    { today: localDate() },
    { staleTime: 30_000, enabled: opts.enabled ?? true },
  );
}

export function libraryLookup(bootstrap: Pick<GymBootstrap, 'library'>): ExerciseLookup {
  const byId = new Map(bootstrap.library.map((exercise) => [exercise.id, exercise]));
  return (id) => byId.get(id);
}

/** ExerciseDto.images are API-relative (`/static/exercises/<key>`). */
export function exerciseImageUrl(exercise: Pick<ExerciseDto, 'images'>, index = 0): string | null {
  const path = exercise.images[index];
  if (!path) return null;
  if (path.startsWith('http')) return path;
  // In production Caddy serves /static/* on the web origin; in dev the API is separate.
  const base = env.NEXT_PUBLIC_API_URL.replace(/\/trpc\/?$/, '').replace(/\/$/, '');
  return `${base}${path}`;
}
