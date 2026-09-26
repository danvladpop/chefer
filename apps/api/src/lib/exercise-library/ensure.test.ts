import { describe, expect, it, vi } from 'vitest';
import type { Exercise, IExerciseRepository } from '@chefer/database';
import { EXERCISE_CATALOG, type ExerciseCatalogEntry } from '@chefer/types';
import { catalogToWriteData, imageKeysFor, syncExerciseLibrary } from './ensure.js';

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
  it('lists only photos that exist, and none without a free-exercise-db id', () => {
    const e = entry({ id: 'bench' });
    expect(imageKeysFor(e, (f) => f === 'bench-0.webp')).toEqual(['bench-0.webp']);
    expect(imageKeysFor(e, () => true)).toEqual(['bench-0.webp', 'bench-1.webp']);
    expect(imageKeysFor(entry({ freeExerciseDbId: null }), () => true)).toEqual([]);
  });
});

describe('vendored photos (apps/api/static/exercises)', () => {
  it('ships both photos for every catalog exercise with a free-exercise-db id', () => {
    // Deploys serve these files as-is; a new catalog entry without its vendored
    // photos would silently show none (run scripts/gym/vendor-exercise-photos.ts).
    const missing = EXERCISE_CATALOG.filter(
      (e) => e.freeExerciseDbId !== null && imageKeysFor(e).length !== 2,
    ).map((e) => e.id);
    expect(missing).toEqual([]);
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
