import { describe, expect, it, vi } from 'vitest';
import type { BodyMeasurement, IBodyMeasurementRepository } from '@chefer/database';
import { BodyMeasurementService } from './body-measurement.service.js';

// Lane D3: body measurements — one entry per local day, measures merge, and
// a write with nothing in it is refused.

const row = (over: Partial<BodyMeasurement> = {}): BodyMeasurement => ({
  id: 'm1',
  userId: 'u1',
  measuredOn: new Date('2026-10-20T00:00:00Z'),
  waistCm: 82,
  hipsCm: null,
  chestCm: null,
  upperArmCm: null,
  thighCm: null,
  bodyFatPct: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});

function makeRepo(over: Partial<IBodyMeasurementRepository> = {}): IBodyMeasurementRepository {
  return {
    listSince: vi.fn().mockResolvedValue([row()]),
    upsertForDay: vi.fn().mockResolvedValue(row()),
    deleteForUser: vi.fn().mockResolvedValue(true),
    ...over,
  };
}

describe('BodyMeasurementService', () => {
  it('lists the window from the start of its first day, as calendar dates', async () => {
    const repo = makeRepo();
    const service = new BodyMeasurementService(repo);

    const list = await service.list('u1', 30, new Date('2026-10-22T15:00:00Z'));

    expect(repo.listSince).toHaveBeenCalledWith('u1', new Date('2026-09-22T00:00:00Z'));
    expect(list).toEqual([
      {
        id: 'm1',
        measuredOn: '2026-10-20',
        waistCm: 82,
        hipsCm: null,
        chestCm: null,
        upperArmCm: null,
        thighCm: null,
        bodyFatPct: null,
      },
    ]);
  });

  it('writes the given measures into the local day', async () => {
    const repo = makeRepo();
    await new BodyMeasurementService(repo).log('u1', '2026-10-20', { waistCm: 82, bodyFatPct: 21 });
    expect(repo.upsertForDay).toHaveBeenCalledWith('u1', new Date('2026-10-20T00:00:00Z'), {
      waistCm: 82,
      bodyFatPct: 21,
    });
  });

  it('refuses an entry with no measures', async () => {
    const repo = makeRepo();
    await expect(
      new BodyMeasurementService(repo).log('u1', '2026-10-20', {}),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(repo.upsertForDay).not.toHaveBeenCalled();
  });

  it("someone else's entry reads NOT_FOUND", async () => {
    const repo = makeRepo({ deleteForUser: vi.fn().mockResolvedValue(false) });
    await expect(new BodyMeasurementService(repo).delete('u1', 'other')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
