import { beforeEach, describe, expect, it, vi } from 'vitest';
import { weightEntryRepository } from '@chefer/database';
import { trackerService } from './tracker.service.js';

// C2 health sync: weigh-ins read from Apple Health / Health Connect are stored
// like typed ones (the local day at UTC midnight) with their source and sample
// id; the repository skips samples already imported.

vi.mock('@chefer/database', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@chefer/database')>();
  return {
    ...mod,
    weightEntryRepository: { importMany: vi.fn() },
  };
});
const importMany = vi.mocked(weightEntryRepository.importMany);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('trackerService.importWeights', () => {
  it('stores each sample on its local day with its source and id', async () => {
    importMany.mockResolvedValue(2);
    const result = await trackerService.importWeights('u1', 'APPLE_HEALTH', [
      { externalId: 'hk-a', weightKg: 81.2, date: '2026-10-20' },
      { externalId: 'hk-b', weightKg: 80.9, date: '2026-10-21' },
    ]);
    expect(importMany).toHaveBeenCalledWith('u1', 'APPLE_HEALTH', [
      { externalId: 'hk-a', weightKg: 81.2, recordedAt: new Date('2026-10-20T00:00:00Z') },
      { externalId: 'hk-b', weightKg: 80.9, recordedAt: new Date('2026-10-21T00:00:00Z') },
    ]);
    expect(result).toEqual({ imported: 2, skipped: 0 });
  });

  it('reports the samples it already had as skipped', async () => {
    importMany.mockResolvedValue(1);
    const result = await trackerService.importWeights('u1', 'HEALTH_CONNECT', [
      { externalId: 'hc-a', weightKg: 81.2, date: '2026-10-20' },
      { externalId: 'hc-b', weightKg: 80.9, date: '2026-10-21' },
    ]);
    expect(result).toEqual({ imported: 1, skipped: 1 });
  });
});
