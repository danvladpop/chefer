// Coaching content per curated exercise, keyed by slug (see exercise-catalog.ts).
// Source: docs/gym/exercise-library-research.md — cues/mistakes are written in
// Chefer's own words; media ids are verified (oEmbed) YouTube clips and
// public-domain free-exercise-db photo ids. Owned by gym_plan.md G0-4 / G1-D.

import type { ExerciseCatalogEntry } from './exercise-catalog';

export type ExerciseContent = Pick<
  ExerciseCatalogEntry,
  'cues' | 'mistakes' | 'blurb' | 'freeExerciseDbId' | 'videoId' | 'videoStartSec' | 'videoChannel'
> & { aliases?: string[] };

/**
 * Missing entries render as "no cues yet"; the catalog invariant test lists them.
 */
export const EXERCISE_CONTENT: Record<string, ExerciseContent> = {};
