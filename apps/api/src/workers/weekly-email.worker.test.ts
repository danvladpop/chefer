import { beforeEach, describe, expect, it, vi } from 'vitest';
import { weeklyEmailService } from '../application/notifications/weekly-email.service.js';
import { WeeklyEmailWorker } from './weekly-email.worker.js';

vi.mock('../application/notifications/weekly-email.service.js', () => {
  const empty = { sent: 0, skipped: 0, failed: 0, previews: [] };
  return {
    weeklyEmailService: {
      sendWeekReady: vi.fn().mockResolvedValue(empty),
      sendWeeklyRecap: vi.fn().mockResolvedValue(empty),
    },
  };
});

describe('WeeklyEmailWorker schedule (fixed UTC hours)', () => {
  const worker = new WeeklyEmailWorker();
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Monday from 07:00 UTC sends "week ready"', async () => {
    await worker.tick(new Date('2026-09-21T06:59:00Z'));
    expect(weeklyEmailService.sendWeekReady).not.toHaveBeenCalled();
    const at = new Date('2026-09-21T07:00:00Z');
    await worker.tick(at);
    expect(weeklyEmailService.sendWeekReady).toHaveBeenCalledWith(at);
    expect(weeklyEmailService.sendWeeklyRecap).not.toHaveBeenCalled();
  });

  it('Sunday from 17:00 UTC sends the recap', async () => {
    await worker.tick(new Date('2026-09-27T16:00:00Z'));
    expect(weeklyEmailService.sendWeeklyRecap).not.toHaveBeenCalled();
    const at = new Date('2026-09-27T21:00:00Z');
    await worker.tick(at);
    expect(weeklyEmailService.sendWeeklyRecap).toHaveBeenCalledWith(at);
  });

  it('does nothing on other days', async () => {
    await worker.tick(new Date('2026-09-23T12:00:00Z'));
    expect(weeklyEmailService.sendWeekReady).not.toHaveBeenCalled();
    expect(weeklyEmailService.sendWeeklyRecap).not.toHaveBeenCalled();
  });

  it('a failing sweep is contained', async () => {
    vi.mocked(weeklyEmailService.sendWeekReady).mockRejectedValueOnce(new Error('db down'));
    await expect(worker.tick(new Date('2026-09-21T08:00:00Z'))).resolves.toBeUndefined();
  });
});
