import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Exercise, IExerciseRepository } from '@chefer/database';
import { ExerciseLibraryService } from './exercise-library.service.js';

// The boot-time library sync pulls in env validation; it is not under test here.
vi.mock('../../lib/exercise-library/ensure.js', () => ({ ensureExerciseLibrary: vi.fn() }));
vi.mock('./client-level.js', () => ({ filterExerciseDtosForLevel: vi.fn() }));

// UX-GYM-34: restoring an archived custom exercise.

const USER = 'u1';

function row(over: Partial<Exercise> = {}): Exercise {
  return { id: 'custom-1', ownerId: USER, archivedAt: new Date('2026-09-01'), ...over } as Exercise;
}

function setup(found: Exercise | null, customCount = 3) {
  const repo = {
    findById: vi.fn().mockResolvedValue(found),
    countCustom: vi.fn().mockResolvedValue(customCount),
    restore: vi.fn().mockResolvedValue(undefined),
  } as unknown as IExerciseRepository;
  return { service: new ExerciseLibraryService(repo, () => Promise.resolve()), repo };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ExerciseLibraryService.restoreCustom', () => {
  it('restores an archived custom exercise the user owns', async () => {
    const { service, repo } = setup(row());
    await expect(service.restoreCustom(USER, 'custom-1')).resolves.toEqual({ ok: true });
    expect(repo.restore).toHaveBeenCalledWith('custom-1');
  });

  it('is a no-op for an exercise that is not archived', async () => {
    const { service, repo } = setup(row({ archivedAt: null }));
    await expect(service.restoreCustom(USER, 'custom-1')).resolves.toEqual({ ok: true });
    expect(repo.restore).not.toHaveBeenCalled();
  });

  it('reads curated or other users’ rows as NOT_FOUND', async () => {
    for (const found of [null, row({ ownerId: null }), row({ ownerId: 'someone-else' })]) {
      const { service, repo } = setup(found);
      await expect(service.restoreCustom(USER, 'custom-1')).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
      expect(repo.restore).not.toHaveBeenCalled();
    }
  });

  it('refuses at the custom-exercise cap, like createCustom', async () => {
    const { service, repo } = setup(row(), 200);
    await expect(service.restoreCustom(USER, 'custom-1')).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    expect(repo.restore).not.toHaveBeenCalled();
  });
});
