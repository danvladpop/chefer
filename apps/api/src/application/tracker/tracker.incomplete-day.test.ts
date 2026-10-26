import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dailyLogRepository } from '@chefer/database';
import { trackerService } from './tracker.service.js';

// Lane D2: "Partly logged day" — a flag on the day, stored through the
// repository, that the weekly review reads (coach.service.test.ts covers the
// review side).

vi.mock('@chefer/database', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@chefer/database')>()),
  dailyLogRepository: { setIncomplete: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('trackerService.setDayIncomplete', () => {
  it('marks the local calendar day and echoes the stored flag', async () => {
    vi.mocked(dailyLogRepository.setIncomplete).mockResolvedValue(true);

    await expect(trackerService.setDayIncomplete('u1', '2026-10-20', true)).resolves.toEqual({
      date: '2026-10-20',
      incomplete: true,
    });
    const [userId, date, incomplete] = vi.mocked(dailyLogRepository.setIncomplete).mock
      .calls[0] ?? [null, null, null];
    expect(userId).toBe('u1');
    expect(date?.toISOString()).toBe('2026-10-20T00:00:00.000Z');
    expect(incomplete).toBe(true);
  });

  it('clears the mark', async () => {
    vi.mocked(dailyLogRepository.setIncomplete).mockResolvedValue(false);
    await expect(trackerService.setDayIncomplete('u1', '2026-10-20', false)).resolves.toEqual({
      date: '2026-10-20',
      incomplete: false,
    });
  });
});
