import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  exerciseRepository,
  type Exercise,
  type ExerciseWriteData,
  type IExerciseRepository,
} from '@chefer/database';
import { EXERCISE_CATALOG, type ExerciseCatalogEntry } from '@chefer/types';

// ─── Curated exercise library seeding (gym_plan.md §4.1) ─────────────────────
// Production never runs the seed, so the API upserts the @chefer/types
// EXERCISE_CATALOG into the `exercises` table itself: once per process at
// boot, and lazily before the first library read (mirrors
// ensureCuratedRecipes). Safe on any database — upsert by slug, never deletes.
// A curated row whose content changed gets contentVersion + 1 (clients use it
// to refresh cached media/cues); a slug dropped from the catalog is archived
// (sessions still reference it).

/**
 * Self-hosted free-exercise-db photos (public domain), served by Express at
 * /static/exercises/<key> and proxied by Caddy (gym_plan.md §5.5). Photos are
 * named `<slug>-0.webp` (start) and `<slug>-1.webp` (end).
 */
export const EXERCISE_STATIC_DIR = fileURLToPath(
  new URL('../../../static/exercises/', import.meta.url),
);
export const EXERCISE_STATIC_ROUTE = '/static/exercises';

/**
 * API-relative image URL for a stored image key. ExerciseDto.images carries
 * these absolute-PATH URLs ("/static/exercises/bench-0.webp"); clients prefix
 * the API origin they already talk to (web: same origin via Caddy; mobile:
 * EXPO_PUBLIC_API_URL), so the DB never stores a hostname.
 */
export function exerciseImageUrl(key: string): string {
  return `${EXERCISE_STATIC_ROUTE}/${key}`;
}

export function imageKeysFor(
  entry: Pick<ExerciseCatalogEntry, 'id' | 'freeExerciseDbId'>,
  fileExists: (file: string) => boolean = (f) => existsSync(path.join(EXERCISE_STATIC_DIR, f)),
): string[] {
  if (!entry.freeExerciseDbId) return [];
  return [`${entry.id}-0.webp`, `${entry.id}-1.webp`].filter(fileExists);
}

export function catalogToWriteData(
  entry: ExerciseCatalogEntry,
  imageKeys: string[],
): ExerciseWriteData {
  return {
    name: entry.name,
    aliases: entry.aliases,
    category: entry.category,
    movementPattern: entry.movementPattern,
    equipment: entry.equipment,
    loadType: entry.loadType,
    primaryMuscles: entry.primaryMuscles,
    secondaryMuscles: entry.secondaryMuscles,
    repMin: entry.repMin,
    repMax: entry.repMax,
    restSec: entry.restSec,
    incrementKg: entry.incrementKg,
    perHand: entry.perHand,
    isLowerBody: entry.isLowerBody,
    isTimed: entry.isTimed,
    swapGroup: entry.swapGroup,
    cues: entry.cues,
    mistakes: entry.mistakes,
    blurb: entry.blurb,
    imageKeys,
    videoId: entry.videoId,
    videoStartSec: entry.videoStartSec,
    videoChannel: entry.videoChannel,
  };
}

function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }
  return a === b;
}

/** Fields of `want` that differ from the stored row (empty = up to date). */
export function changedFields(row: Exercise, want: ExerciseWriteData): (keyof ExerciseWriteData)[] {
  return (Object.keys(want) as (keyof ExerciseWriteData)[]).filter(
    (k) => !sameValue(row[k], want[k]),
  );
}

export interface EnsureResult {
  created: number;
  updated: number;
  archived: number;
}

/** One sync pass. Exported for tests; production calls ensureExerciseLibrary(). */
export async function syncExerciseLibrary(
  repo: IExerciseRepository = exerciseRepository,
  catalog: readonly ExerciseCatalogEntry[] = EXERCISE_CATALOG,
  fileExists?: (file: string) => boolean,
): Promise<EnsureResult> {
  const existing = new Map((await repo.findAllCurated()).map((r) => [r.id, r]));
  const result: EnsureResult = { created: 0, updated: 0, archived: 0 };

  for (const entry of catalog) {
    const want = catalogToWriteData(entry, imageKeysFor(entry, fileExists));
    const row = existing.get(entry.id);
    if (!row) {
      await repo.createCurated(entry.id, want);
      result.created++;
      continue;
    }
    const changed = changedFields(row, want);
    if (changed.length > 0 || row.archivedAt) {
      await repo.updateCurated(entry.id, {
        ...want,
        contentVersion: changed.length > 0 ? row.contentVersion + 1 : row.contentVersion,
        archivedAt: null,
      });
      result.updated++;
    }
  }

  const slugs = new Set(catalog.map((e) => e.id));
  for (const row of existing.values()) {
    if (!slugs.has(row.id) && !row.archivedAt) {
      await repo.updateCurated(row.id, { archivedAt: new Date() });
      result.archived++;
    }
  }
  return result;
}

let pending: Promise<void> | null = null;

/**
 * Idempotent, once per process. Concurrent callers share one pass; a failed
 * pass is retried by the next caller instead of being cached.
 */
export function ensureExerciseLibrary(): Promise<void> {
  pending ??= syncExerciseLibrary()
    .then((r) => {
      console.log(
        `[exercise-library] ensured ${EXERCISE_CATALOG.length} curated exercises ` +
          `(created ${r.created}, updated ${r.updated}, archived ${r.archived})`,
      );
    })
    .catch((err: unknown) => {
      pending = null;
      throw err;
    });
  return pending;
}

/** Test hook. */
export function resetExerciseLibraryEnsure(): void {
  pending = null;
}
