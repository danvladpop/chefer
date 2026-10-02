import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ITrainingPauseRepository, TrainingPause } from '@chefer/database';
import { TrainingPauseService } from './training-pause.service.js';

vi.mock('@chefer/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@chefer/utils')>()),
  addDaysLocal: vi.fn((d: string, n: number) => {
    const t = new Date(`${d}T00:00:00Z`);
    t.setUTCDate(t.getUTCDate() + n);
    return t.toISOString().slice(0, 10);
  }),
}));

function pause(over: Partial<TrainingPause> = {}): TrainingPause {
  return {
    id: 'p1',
    userId: 'u1',
    startDate: '2026-09-20',
    endDate: '2026-09-30',
    reason: 'vacation',
    createdAt: new Date(),
    ...over,
  };
}

function setup(existing: TrainingPause[] = []) {
  const repo: ITrainingPauseRepository = {
    listForUser: vi.fn().mockResolvedValue(existing),
    findByIdForUser: vi.fn().mockResolvedValue(existing[0] ?? null),
    create: vi.fn().mockResolvedValue(pause({ id: 'new' })),
    updateEndDate: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  };
  return { service: new TrainingPauseService(repo), repo };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('TrainingPauseService', () => {
  it('creates a valid pause', async () => {
    const { service } = setup();
    await expect(
      service.create('u1', { startDate: '2026-10-01', endDate: '2026-10-14', reason: null }),
    ).resolves.toEqual({ id: 'new' });
  });

  it('rejects inverted, too-long and overlapping ranges', async () => {
    const { service } = setup([pause()]);
    await expect(
      service.create('u1', { startDate: '2026-10-05', endDate: '2026-10-01', reason: null }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(
      service.create('u1', { startDate: '2026-10-01', endDate: '2026-11-15', reason: null }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(
      service.create('u1', { startDate: '2026-09-28', endDate: '2026-10-03', reason: null }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('end: an active pause ends yesterday (inclusive range); a future one is removed', async () => {
    const active = setup([pause()]);
    await active.service.end('u1', 'p1', '2026-09-24');
    expect(active.repo.updateEndDate).toHaveBeenCalledWith('p1', '2026-09-23');
    expect(active.repo.delete).not.toHaveBeenCalled();

    const future = setup([pause({ startDate: '2026-10-10', endDate: '2026-10-20' })]);
    await future.service.end('u1', 'p1', '2026-09-24');
    expect(future.repo.delete).toHaveBeenCalledWith('p1');
  });

  it('end: a pause started today and ended today is removed, so Start works again (UX-GYM-06)', async () => {
    const { service, repo } = setup([pause({ startDate: '2026-09-24', endDate: '2026-10-01' })]);
    await service.end('u1', 'p1', '2026-09-24');
    expect(repo.delete).toHaveBeenCalledWith('p1');
    expect(repo.updateEndDate).not.toHaveBeenCalled();
  });

  it('end: a pause that already finished is left alone', async () => {
    const { service, repo } = setup([pause({ startDate: '2026-09-01', endDate: '2026-09-10' })]);
    await service.end('u1', 'p1', '2026-09-24');
    expect(repo.delete).not.toHaveBeenCalled();
    expect(repo.updateEndDate).not.toHaveBeenCalled();
  });

  it("end of someone else's pause is NOT_FOUND", async () => {
    const { service } = setup([]);
    await expect(service.end('u1', 'p1')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
