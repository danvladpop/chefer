import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChefProfile, IChefProfileRepository, UpsertChefProfileData } from '@chefer/database';
import { TrainingDaysService } from './training-days.service.js';

// T-06.9: `getDayKinds`/`setDayKinds` back both the gym settings "Training
// days & reminders" kind row and onboarding (T-03.9) — `lift` is always
// derived from the active routine and is never stored/returned here.

function profile(trainingDayKinds: unknown = null): ChefProfile {
  return { userId: 'u1', trainingDayKinds } as ChefProfile;
}

function setup(initial: unknown = null) {
  const upsert = vi.fn(
    (_userId: string, data: UpsertChefProfileData): Promise<ChefProfile> =>
      Promise.resolve(profile(data.trainingDayKinds)),
  );
  const repo: IChefProfileRepository = {
    findByUserId: vi.fn().mockResolvedValue(profile(initial)),
    upsert,
    delete: vi.fn().mockResolvedValue(undefined),
  };
  return { service: new TrainingDaysService(repo), repo };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('TrainingDaysService', () => {
  it('returns {} when nothing has been set yet', async () => {
    const { service } = setup(null);
    await expect(service.getDayKinds('u1')).resolves.toEqual({});
  });

  it('sets a weekday kind and persists the merged record', async () => {
    const { service, repo } = setup({ '5': 'long_run' });
    const result = await service.setDayKinds('u1', { '2': 'run' });
    expect(result).toEqual({ '2': 'run', '5': 'long_run' });
    expect(repo.upsert).toHaveBeenCalledWith('u1', {
      trainingDayKinds: { '2': 'run', '5': 'long_run' },
    });
  });

  it('clears a weekday back to unset with null', async () => {
    const { service } = setup({ '2': 'run', '5': 'long_run' });
    const result = await service.setDayKinds('u1', { '2': null });
    expect(result).toEqual({ '5': 'long_run' });
  });

  it('rejects an out-of-range weekday key', async () => {
    const { service } = setup();
    await expect(service.setDayKinds('u1', { '7': 'rest' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('never returns a stored "lift" value — the routine is the only source', async () => {
    // Defensive: even if something upstream ever persisted `lift` directly.
    const { service } = setup({ '0': 'lift', '3': 'rest' });
    await expect(service.getDayKinds('u1')).resolves.toEqual({ '3': 'rest' });
  });
});
