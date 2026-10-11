import { mkdir, mkdtemp, readdir, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { logger } from '../lib/logger.js';
import { UploadSweeperWorker, type UploadSweeperDeps } from './upload-sweeper.worker.js';

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('../lib/env.js', () => ({ env: { UPLOAD_SWEEP_DRY_RUN: false } }));

const NOW = new Date('2026-10-11T03:00:00Z');
const HOUR_MS = 60 * 60 * 1000;

const OLD_ORPHAN = '0b8f7a3e-5c1d-4e2f-9a6b-1c2d3e4f5a60.jpg';
const OLD_USED = '0b8f7a3e-5c1d-4e2f-9a6b-1c2d3e4f5a61.jpg';
const YOUNG_ORPHAN = '0b8f7a3e-5c1d-4e2f-9a6b-1c2d3e4f5a62.jpg';
const OLD_GENERATED_ORPHAN = 'recipes/cm1abc-0123456789ab.webp';
const OLD_GENERATED_USED = 'recipes/cm1def-0123456789ab.png';

let dir: string;

async function put(rel: string, ageHours: number, bytes = 10): Promise<void> {
  const file = path.join(dir, rel);
  await writeFile(file, Buffer.alloc(bytes));
  const t = new Date(NOW.getTime() - ageHours * HOUR_MS);
  await utimes(file, t, t);
}

function makeDeps(over: Partial<UploadSweeperDeps> = {}) {
  const findUploadUrls = vi.fn(async (_fragments?: string[]) => [
    `https://chefer.duckdns.org/uploads/${OLD_USED}`,
    `http://localhost:3001/uploads/${OLD_GENERATED_USED}`,
    'https://images.unsplash.com/photo-1.jpg',
  ]);
  const purgeSoftDeletedRecipes = vi.fn(async () => ({ purged: 2, keptInUse: 1 }));
  const allFileNames = vi.fn(async () => [OLD_ORPHAN, OLD_USED, 'gone-already.jpg']);
  const deleteByFileNames = vi.fn(async (names: string[]) => names.length);
  const deps: UploadSweeperDeps = {
    references: { findUploadUrls, purgeSoftDeletedRecipes },
    ledger: { allFileNames, deleteByFileNames },
    dir,
    dryRun: false,
    ...over,
  };
  return { deps, findUploadUrls, purgeSoftDeletedRecipes, allFileNames, deleteByFileNames };
}

beforeEach(async () => {
  vi.mocked(logger.info).mockClear();
  dir = await mkdtemp(path.join(tmpdir(), 'chefer-sweep-'));
  await mkdir(path.join(dir, 'recipes'));
  await put(OLD_ORPHAN, 48, 100);
  await put(OLD_USED, 48);
  await put(YOUNG_ORPHAN, 2);
  await put(OLD_GENERATED_ORPHAN, 72, 50);
  await put(OLD_GENERATED_USED, 72);
  await put('.write-probe-1', 72); // never ours to delete
  await put('notes.txt', 72);
});

describe('UploadSweeperWorker.sweep', () => {
  it('deletes unreferenced files older than 24 h — user uploads and generated images — and nothing else', async () => {
    const { deps } = makeDeps();
    const result = await new UploadSweeperWorker(deps).sweep(NOW);

    expect((await readdir(dir)).sort()).toEqual(
      ['.write-probe-1', OLD_USED, YOUNG_ORPHAN, 'notes.txt', 'recipes'].sort(),
    );
    expect(await readdir(path.join(dir, 'recipes'))).toEqual(['cm1def-0123456789ab.png']);
    expect(result).toMatchObject({
      dryRun: false,
      scanned: 5,
      referenced: 2,
      young: 1,
      deleted: 2,
      bytesFreed: 150,
      purgedRecipes: 2,
      keptInUseRecipes: 1,
    });
  });

  it('purges recipes soft-deleted more than 30 days ago, before sweeping', async () => {
    const { deps, purgeSoftDeletedRecipes } = makeDeps();
    await new UploadSweeperWorker(deps).sweep(NOW);
    expect(purgeSoftDeletedRecipes).toHaveBeenCalledWith(new Date('2026-09-11T03:00:00Z'), 500);
  });

  it('drops ledger rows whose file is gone (swept now or lost earlier)', async () => {
    const { deps, deleteByFileNames } = makeDeps();
    const result = await new UploadSweeperWorker(deps).sweep(NOW);
    expect(deleteByFileNames).toHaveBeenCalledWith([OLD_ORPHAN, 'gone-already.jpg']);
    expect(result.ledgerRowsDeleted).toBe(2);
  });

  it('logs one uploads.sweep summary line', async () => {
    const { deps } = makeDeps();
    await new UploadSweeperWorker(deps).sweep(NOW);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ deleted: 2, scanned: 5 }),
      'uploads.sweep',
    );
  });

  it('dry run: reports the same counts but deletes nothing (recipes included)', async () => {
    const { deps, purgeSoftDeletedRecipes, deleteByFileNames } = makeDeps({ dryRun: true });
    const before = await readdir(dir);
    const result = await new UploadSweeperWorker(deps).sweep(NOW);

    expect(await readdir(dir)).toEqual(before);
    expect(await readdir(path.join(dir, 'recipes'))).toHaveLength(2);
    expect(result).toMatchObject({ dryRun: true, deleted: 2, ledgerRowsDeleted: 2 });
    expect(purgeSoftDeletedRecipes).not.toHaveBeenCalled();
    expect(deleteByFileNames).not.toHaveBeenCalled();
  });

  it('deletes nothing when the reference query fails', async () => {
    const { deps, findUploadUrls } = makeDeps();
    findUploadUrls.mockRejectedValue(new Error('db down'));
    await expect(new UploadSweeperWorker(deps).sweep(NOW)).rejects.toThrow('db down');
    expect(await readdir(dir)).toContain(OLD_ORPHAN);
  });

  it('still sweeps files when the recipe purge fails', async () => {
    const { deps, purgeSoftDeletedRecipes } = makeDeps();
    purgeSoftDeletedRecipes.mockRejectedValue(new Error('fk'));
    const result = await new UploadSweeperWorker(deps).sweep(NOW);
    expect(result.deleted).toBe(2);
  });
});

describe('UploadSweeperWorker.tick', () => {
  it('runs once per UTC day and retries a failed day on the next tick', async () => {
    const { deps, findUploadUrls } = makeDeps();
    const worker = new UploadSweeperWorker(deps);
    findUploadUrls.mockRejectedValueOnce(new Error('db down'));

    await worker.tick(NOW); // fails → day not marked
    await worker.tick(new Date(NOW.getTime() + HOUR_MS)); // runs
    await worker.tick(new Date(NOW.getTime() + 2 * HOUR_MS)); // same day → skipped
    expect(findUploadUrls).toHaveBeenCalledTimes(2);

    await worker.tick(new Date(NOW.getTime() + 24 * HOUR_MS)); // next day
    expect(findUploadUrls).toHaveBeenCalledTimes(3);
  });
});
