import { beforeEach, describe, expect, it, vi } from 'vitest';
import { exerciseRepository } from '@chefer/database';
import { gymTrackingBackfillService } from './tracking-backfill.service.js';

vi.mock('@chefer/database', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@chefer/database')>();
  return {
    ...mod,
    exerciseRepository: {
      findTrackingTypeBackfillCandidates: vi.fn(),
      setTrackingType: vi.fn(),
    },
  };
});

describe('GymTrackingBackfillService.backfillTrackingTypes (S18, T-42.0, Δ2.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets DURATION for an isTimed custom and BODYWEIGHT_REPS for a BODYWEIGHT custom', async () => {
    vi.mocked(exerciseRepository.findTrackingTypeBackfillCandidates)
      .mockResolvedValueOnce([
        { id: 'custom-1', isTimed: true, loadType: 'WEIGHTED' },
        { id: 'custom-2', isTimed: false, loadType: 'BODYWEIGHT' },
      ] as never)
      .mockResolvedValueOnce([] as never);
    vi.mocked(exerciseRepository.setTrackingType).mockResolvedValue(undefined);

    const result = await gymTrackingBackfillService.backfillTrackingTypes();

    expect(result).toEqual({ duration: 1, bodyweightReps: 1 });
    expect(exerciseRepository.setTrackingType).toHaveBeenCalledWith('custom-1', 'DURATION');
    expect(exerciseRepository.setTrackingType).toHaveBeenCalledWith('custom-2', 'BODYWEIGHT_REPS');
  });

  it('isTimed wins when a row is both isTimed and BODYWEIGHT', async () => {
    vi.mocked(exerciseRepository.findTrackingTypeBackfillCandidates)
      .mockResolvedValueOnce([{ id: 'custom-3', isTimed: true, loadType: 'BODYWEIGHT' }] as never)
      .mockResolvedValueOnce([] as never);
    vi.mocked(exerciseRepository.setTrackingType).mockResolvedValue(undefined);

    const result = await gymTrackingBackfillService.backfillTrackingTypes();

    expect(result).toEqual({ duration: 1, bodyweightReps: 0 });
    expect(exerciseRepository.setTrackingType).toHaveBeenCalledWith('custom-3', 'DURATION');
  });

  it('a second run writes nothing (idempotent — the repo query no longer matches backfilled rows)', async () => {
    vi.mocked(exerciseRepository.findTrackingTypeBackfillCandidates).mockResolvedValueOnce(
      [] as never,
    );

    const result = await gymTrackingBackfillService.backfillTrackingTypes();

    expect(result).toEqual({ duration: 0, bodyweightReps: 0 });
    expect(exerciseRepository.setTrackingType).not.toHaveBeenCalled();
  });

  it('pages through more than one batch until the repo returns empty', async () => {
    vi.mocked(exerciseRepository.findTrackingTypeBackfillCandidates)
      .mockResolvedValueOnce([{ id: 'a', isTimed: true, loadType: 'WEIGHTED' }] as never)
      .mockResolvedValueOnce([{ id: 'b', isTimed: true, loadType: 'WEIGHTED' }] as never)
      .mockResolvedValueOnce([] as never);
    vi.mocked(exerciseRepository.setTrackingType).mockResolvedValue(undefined);

    const result = await gymTrackingBackfillService.backfillTrackingTypes(1);

    expect(result).toEqual({ duration: 2, bodyweightReps: 0 });
    expect(exerciseRepository.findTrackingTypeBackfillCandidates).toHaveBeenCalledTimes(3);
  });
});
