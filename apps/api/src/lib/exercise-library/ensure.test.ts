import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { Exercise, IExerciseRepository } from '@chefer/database';
import { EXERCISE_CATALOG, type ExerciseCatalogEntry } from '@chefer/types';
import {
  catalogToWriteData,
  EXERCISE_STATIC_DIR,
  imageKeysFor,
  syncExerciseLibrary,
} from './ensure.js';
import { webpDimensions } from './webp-dimensions.js';

const entry = (over: Partial<ExerciseCatalogEntry> = {}): ExerciseCatalogEntry => ({
  ...EXERCISE_CATALOG[0]!,
  freeExerciseDbId: 'Barbell_Bench_Press',
  ...over,
});

function storedRow(e: ExerciseCatalogEntry, over: Partial<Exercise> = {}): Exercise {
  return {
    id: e.id,
    ownerId: null,
    ...catalogToWriteData(e, []),
    // S18 (T-42.0): ExerciseWriteData.trackingType is optional (existing
    // callers keep compiling); the full Exercise row always has one.
    trackingType: e.trackingType ?? 'WEIGHT_REPS',
    contentVersion: 3,
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
}

function repo(rows: Exercise[]) {
  return {
    findAllCurated: vi.fn().mockResolvedValue(rows),
    createCurated: vi.fn().mockResolvedValue(undefined),
    updateCurated: vi.fn().mockResolvedValue(undefined),
  } as unknown as IExerciseRepository & {
    createCurated: ReturnType<typeof vi.fn>;
    updateCurated: ReturnType<typeof vi.fn>;
  };
}

const noFiles = () => false;

describe('syncExerciseLibrary', () => {
  it('creates missing curated rows', async () => {
    const r = repo([]);
    const res = await syncExerciseLibrary(r, [entry()], noFiles);
    expect(res).toEqual({ created: 1, updated: 0, archived: 0 });
    expect(r.createCurated).toHaveBeenCalledWith(entry().id, catalogToWriteData(entry(), []));
  });

  it('leaves up-to-date rows alone', async () => {
    const e = entry();
    const r = repo([storedRow(e)]);
    const res = await syncExerciseLibrary(r, [e], noFiles);
    expect(res).toEqual({ created: 0, updated: 0, archived: 0 });
  });

  it('bumps contentVersion when content changed', async () => {
    const e = entry();
    const r = repo([storedRow(e, { cues: ['old cue'] })]);
    await syncExerciseLibrary(r, [e], noFiles);
    expect(r.updateCurated).toHaveBeenCalledWith(
      e.id,
      expect.objectContaining({ cues: e.cues, contentVersion: 4, archivedAt: null }),
    );
  });

  it('archives curated rows whose slug left the catalog', async () => {
    const e = entry();
    const r = repo([storedRow(e), storedRow(entry({ id: 'retired-slug' }))]);
    const res = await syncExerciseLibrary(r, [e], noFiles);
    expect(res.archived).toBe(1);
    expect(r.updateCurated).toHaveBeenCalledWith('retired-slug', { archivedAt: expect.any(Date) });
  });
});

describe('imageKeysFor', () => {
  it('lists only photos that exist, whatever their source (no free-exercise-db id needed)', () => {
    const e = entry({ id: 'bench' });
    expect(imageKeysFor(e, (f) => f === 'bench-0.3x2.webp')).toEqual(['bench-0.3x2.webp']);
    expect(imageKeysFor(e, () => true)).toEqual(['bench-0.3x2.webp', 'bench-1.3x2.webp']);
    expect(imageKeysFor(entry({ id: 'bench', freeExerciseDbId: null }), () => true)).toEqual([
      'bench-0.3x2.webp',
      'bench-1.3x2.webp',
    ]);
    expect(imageKeysFor(entry({ id: 'bench', freeExerciseDbId: null }), () => false)).toEqual([]);
  });

  it('gives a re-vendored photo a new key (revision suffix), so cached URLs are not reused', () => {
    expect(imageKeysFor(entry({ id: 'preacher-curl' }), () => true)).toEqual([
      'preacher-curl-0.r2.3x2.webp',
      'preacher-curl-1.r2.3x2.webp',
    ]);
  });

  it('bumps contentVersion when a row gains photos, so installed apps refetch', async () => {
    const e = entry({ id: 'bench', freeExerciseDbId: null });
    const r = repo([storedRow(e)]);
    await syncExerciseLibrary(r, [e], () => true);
    expect(r.updateCurated).toHaveBeenCalledWith(
      'bench',
      expect.objectContaining({
        imageKeys: ['bench-0.3x2.webp', 'bench-1.3x2.webp'],
        contentVersion: 4,
      }),
    );
  });
});

describe('vendored photos (apps/api/static/exercises)', () => {
  it('never ships half a photo pair (start without end, or the reverse)', () => {
    // Which exercises MUST have a pair is guarded in @chefer/types
    // (gym/exercise-media.test.ts); here only that what is on disk is complete.
    const half = EXERCISE_CATALOG.filter((e) => imageKeysFor(e).length === 1).map((e) => e.id);
    expect(half).toEqual([]);
  });

  it('has no orphan photo files that no catalog exercise references', () => {
    const referenced = new Set(EXERCISE_CATALOG.flatMap((e) => imageKeysFor(e)));
    const orphans = readdirSync(EXERCISE_STATIC_DIR).filter(
      (f) => f.endsWith('.webp') && !referenced.has(f),
    );
    expect(orphans).toEqual([]);
  });

  it('is exactly 600×400 (3:2, T-05.11 AC30) for every vendored photo', () => {
    const badSizes: string[] = [];
    for (const e of EXERCISE_CATALOG) {
      for (const key of imageKeysFor(e)) {
        const buf = readFileSync(`${EXERCISE_STATIC_DIR}/${key}`);
        const { width, height } = webpDimensions(buf);
        if (width !== 600 || height !== 400) {
          badSizes.push(`${key}: ${width}×${height}`);
        }
      }
    }
    expect(badSizes).toEqual([]);
  });

  it('creates new catalog entries on an existing database, idempotently (F-GYM-2-1)', async () => {
    const [old, added] = [entry({ id: 'barbell-bench-press' }), entry({ id: 'glute-bridge' })];
    const r = repo([storedRow(old)]);
    const first = await syncExerciseLibrary(r, [old, added], noFiles);
    expect(first).toEqual({ created: 1, updated: 0, archived: 0 });
    expect(r.createCurated).toHaveBeenCalledWith('glute-bridge', expect.any(Object));

    const again = repo([storedRow(old), storedRow(added)]);
    expect(await syncExerciseLibrary(again, [old, added], noFiles)).toEqual({
      created: 0,
      updated: 0,
      archived: 0,
    });
  });
});
