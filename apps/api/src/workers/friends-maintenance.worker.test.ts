import { beforeEach, describe, expect, it, vi } from 'vitest';
import { moderationService } from '../application/friends/moderation.service.js';
import { logger } from '../lib/logger.js';
import { FriendsMaintenanceWorker, isoWeekMarker } from './friends-maintenance.worker.js';

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

beforeEach(() => {
  vi.restoreAllMocks();
  vi.mocked(logger.info).mockClear();
});

describe('isoWeekMarker', () => {
  it('is the UTC Monday of the ISO week', () => {
    expect(isoWeekMarker(new Date('2026-10-01T09:00:00Z'))).toBe('2026-09-28'); // Thursday
    expect(isoWeekMarker(new Date('2026-09-28T00:00:00Z'))).toBe('2026-09-28'); // Monday 00:00
    expect(isoWeekMarker(new Date('2026-10-04T23:59:59Z'))).toBe('2026-09-28'); // Sunday
    expect(isoWeekMarker(new Date('2026-10-05T00:00:00Z'))).toBe('2026-10-05');
    expect(isoWeekMarker(new Date('2027-01-01T12:00:00Z'))).toBe('2026-12-28'); // across years
  });
});

describe('FriendsMaintenanceWorker (F0.3 stub)', () => {
  it('logs the moderation.weekly line once per ISO week', async () => {
    const metrics = vi.spyOn(moderationService, 'weeklyMetrics');
    const worker = new FriendsMaintenanceWorker();
    await worker.tick(new Date('2026-10-01T09:00:00Z'));
    await worker.tick(new Date('2026-10-01T10:00:00Z'));
    await worker.tick(new Date('2026-10-04T23:00:00Z'));
    expect(metrics).toHaveBeenCalledTimes(1);
    expect(metrics).toHaveBeenCalledWith(new Date('2026-09-24T09:00:00Z'));
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ week: '2026-09-28', reports: 0, undo: 0 }),
      'moderation.weekly',
    );
    await worker.tick(new Date('2026-10-05T00:30:00Z'));
    expect(metrics).toHaveBeenCalledTimes(2);
  });

  it('retries next tick when the metrics read fails', async () => {
    const metrics = vi
      .spyOn(moderationService, 'weeklyMetrics')
      .mockRejectedValueOnce(new Error('db down'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const worker = new FriendsMaintenanceWorker();
    await worker.tick(new Date('2026-10-01T09:00:00Z'));
    await worker.tick(new Date('2026-10-01T10:00:00Z'));
    expect(metrics).toHaveBeenCalledTimes(2);
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledTimes(1);
  });
});
