import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FRIENDS_LIMITS, MODERATION } from '@chefer/types';
import { logger } from '../lib/logger.js';
import {
  FriendsMaintenanceWorker,
  isoWeekMarker,
  monthsBefore,
  type FriendsMaintenanceDeps,
} from './friends-maintenance.worker.js';

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const DAY_MS = 24 * 60 * 60 * 1000;
const ZERO_METRICS = {
  reports: 0,
  eligibleReports: 0,
  recipeAutoHidden: 0,
  accountForcedPrivate: 0,
  nameRejected: 0,
  recipeTextRejected: 0,
  recipeFilterHidden: 0,
  undo: 0,
};

function makeDeps() {
  const expirePendingOlderThan = vi.fn<
    [Date],
    Promise<{ followerId: string; followeeId: string }[]>
  >(async () => []);
  const withdraw = vi.fn(async () => 1);
  const notificationsDeleteOlderThan = vi.fn(async () => 0);
  const dismissalsDeleteOlderThan = vi.fn(async () => 0);
  const reportsDeleteOlderThan = vi.fn(async () => 0);
  const moderationLogDeleteOlderThan = vi.fn(async () => 0);
  const weeklyMetrics = vi.fn(async () => ZERO_METRICS);
  const deps: FriendsMaintenanceDeps = {
    follows: { expirePendingOlderThan },
    notifications: { withdraw, deleteOlderThan: notificationsDeleteOlderThan },
    dismissals: { deleteOlderThan: dismissalsDeleteOlderThan },
    reports: { deleteOlderThan: reportsDeleteOlderThan },
    moderationLog: { deleteOlderThan: moderationLogDeleteOlderThan },
    moderation: { weeklyMetrics },
  };
  return {
    deps,
    expirePendingOlderThan,
    withdraw,
    notificationsDeleteOlderThan,
    dismissalsDeleteOlderThan,
    reportsDeleteOlderThan,
    moderationLogDeleteOlderThan,
    weeklyMetrics,
  };
}

beforeEach(() => {
  vi.mocked(logger.info).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
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

describe('monthsBefore', () => {
  it('goes back whole UTC calendar months', () => {
    expect(monthsBefore(new Date('2026-10-01T09:00:00Z'), 24).toISOString()).toBe(
      '2024-10-01T09:00:00.000Z',
    );
    expect(monthsBefore(new Date('2026-03-15T00:00:00Z'), 1).toISOString()).toBe(
      '2026-02-15T00:00:00.000Z',
    );
  });
});

describe('FriendsMaintenanceWorker: weekly moderation line', () => {
  it('logs the moderation.weekly line once per ISO week', async () => {
    const m = makeDeps();
    const worker = new FriendsMaintenanceWorker(m.deps);
    await worker.tick(new Date('2026-10-01T09:00:00Z'));
    await worker.tick(new Date('2026-10-01T10:00:00Z'));
    await worker.tick(new Date('2026-10-04T23:00:00Z'));
    expect(m.weeklyMetrics).toHaveBeenCalledTimes(1);
    expect(m.weeklyMetrics).toHaveBeenCalledWith(new Date('2026-09-24T09:00:00Z'));
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ week: '2026-09-28', reports: 0, undo: 0 }),
      'moderation.weekly',
    );
    await worker.tick(new Date('2026-10-05T00:30:00Z'));
    expect(m.weeklyMetrics).toHaveBeenCalledTimes(2);
  });

  it('retries next tick when the metrics read fails', async () => {
    const m = makeDeps();
    m.weeklyMetrics.mockRejectedValueOnce(new Error('db down'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const worker = new FriendsMaintenanceWorker(m.deps);
    await worker.tick(new Date('2026-10-01T09:00:00Z'));
    await worker.tick(new Date('2026-10-01T10:00:00Z'));
    expect(m.weeklyMetrics).toHaveBeenCalledTimes(2);
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledTimes(1);
  });
});

describe('FriendsMaintenanceWorker: housekeeping (F1.5)', () => {
  const NOW = new Date('2026-10-01T09:00:00Z');

  it('expires pending requests older than the expiry window and withdraws each FOLLOW_REQUEST item', async () => {
    const m = makeDeps();
    m.expirePendingOlderThan.mockResolvedValue([
      { followerId: 'dave', followeeId: 'alice' },
      { followerId: 'erin', followeeId: 'bob' },
    ]);
    const worker = new FriendsMaintenanceWorker(m.deps);

    await worker.tick(NOW);

    expect(m.expirePendingOlderThan).toHaveBeenCalledWith(
      new Date(NOW.getTime() - FRIENDS_LIMITS.requestExpiryDays * DAY_MS),
    );
    // recipient = the followee, actor = the follower
    expect(m.withdraw).toHaveBeenCalledTimes(2);
    expect(m.withdraw).toHaveBeenCalledWith('alice', 'FOLLOW_REQUEST', 'dave');
    expect(m.withdraw).toHaveBeenCalledWith('bob', 'FOLLOW_REQUEST', 'erin');
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ expiredRequests: 2 }),
      'friends.housekeeping',
    );
  });

  it('withdraws nothing when no request expired', async () => {
    const m = makeDeps();
    await new FriendsMaintenanceWorker(m.deps).tick(NOW);
    expect(m.withdraw).not.toHaveBeenCalled();
    // Nothing deleted anywhere → no housekeeping line.
    expect(logger.info).not.toHaveBeenCalledWith(expect.anything(), 'friends.housekeeping');
  });

  it('deletes reports and moderation log rows older than 24 months', async () => {
    const m = makeDeps();
    m.reportsDeleteOlderThan.mockResolvedValue(3);
    m.moderationLogDeleteOlderThan.mockResolvedValue(5);

    await new FriendsMaintenanceWorker(m.deps).tick(NOW);

    expect(MODERATION.RECORD_RETENTION_MONTHS).toBe(24);
    const cutoff = monthsBefore(NOW, 24);
    expect(m.reportsDeleteOlderThan).toHaveBeenCalledWith(cutoff);
    expect(m.moderationLogDeleteOlderThan).toHaveBeenCalledWith(cutoff);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ prunedReports: 3, prunedModerationLog: 5 }),
      'friends.housekeeping',
    );
  });

  it('a failed retention step retries on the next tick; the other steps still run', async () => {
    const m = makeDeps();
    m.reportsDeleteOlderThan.mockRejectedValueOnce(new Error('db down'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const worker = new FriendsMaintenanceWorker(m.deps);

    await worker.tick(NOW);
    expect(m.dismissalsDeleteOlderThan).toHaveBeenCalledTimes(1);
    await worker.tick(new Date(NOW.getTime() + 60 * 60 * 1000));
    expect(m.reportsDeleteOlderThan).toHaveBeenCalledTimes(2);
  });

  it('prunes Activity items and suggestion dismissals older than 90 days', async () => {
    const m = makeDeps();
    m.notificationsDeleteOlderThan.mockResolvedValue(4);
    m.dismissalsDeleteOlderThan.mockResolvedValue(2);

    await new FriendsMaintenanceWorker(m.deps).tick(NOW);

    expect(FRIENDS_LIMITS.activityRetentionDays).toBe(90);
    expect(FRIENDS_LIMITS.dismissalDays).toBe(90);
    const cutoff = new Date(NOW.getTime() - 90 * DAY_MS);
    expect(m.notificationsDeleteOlderThan).toHaveBeenCalledWith(cutoff);
    expect(m.dismissalsDeleteOlderThan).toHaveBeenCalledWith(cutoff);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ prunedNotifications: 4, prunedDismissals: 2 }),
      'friends.housekeeping',
    );
  });

  it('runs once per UTC day and again the next day', async () => {
    const m = makeDeps();
    const worker = new FriendsMaintenanceWorker(m.deps);
    await worker.tick(new Date('2026-10-01T00:30:00Z'));
    await worker.tick(new Date('2026-10-01T12:00:00Z'));
    await worker.tick(new Date('2026-10-01T23:30:00Z'));
    expect(m.expirePendingOlderThan).toHaveBeenCalledTimes(1);
    expect(m.notificationsDeleteOlderThan).toHaveBeenCalledTimes(1);
    expect(m.dismissalsDeleteOlderThan).toHaveBeenCalledTimes(1);
    await worker.tick(new Date('2026-10-02T00:30:00Z'));
    expect(m.expirePendingOlderThan).toHaveBeenCalledTimes(2);
  });

  it('a failing step does not stop the others and the day is retried', async () => {
    const m = makeDeps();
    m.expirePendingOlderThan.mockRejectedValueOnce(new Error('db down'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const worker = new FriendsMaintenanceWorker(m.deps);

    await worker.tick(NOW);
    // expiry failed, but both prunes and the weekly line still ran
    expect(m.notificationsDeleteOlderThan).toHaveBeenCalledTimes(1);
    expect(m.dismissalsDeleteOlderThan).toHaveBeenCalledTimes(1);
    expect(m.weeklyMetrics).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledTimes(1);

    // not marked done → the next tick (same day) tries again
    await worker.tick(new Date(NOW.getTime() + 60 * 60 * 1000));
    expect(m.expirePendingOlderThan).toHaveBeenCalledTimes(2);
    // and once everything succeeds, the day is done
    await worker.tick(new Date(NOW.getTime() + 2 * 60 * 60 * 1000));
    expect(m.expirePendingOlderThan).toHaveBeenCalledTimes(2);
  });

  it('a failed withdraw is logged and does not abort the rest of the batch or the prunes', async () => {
    const m = makeDeps();
    m.expirePendingOlderThan.mockResolvedValue([
      { followerId: 'dave', followeeId: 'alice' },
      { followerId: 'erin', followeeId: 'bob' },
    ]);
    m.withdraw.mockRejectedValueOnce(new Error('lock timeout'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await new FriendsMaintenanceWorker(m.deps).tick(NOW);

    expect(m.withdraw).toHaveBeenCalledTimes(2);
    expect(error).toHaveBeenCalledTimes(1);
    expect(m.notificationsDeleteOlderThan).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ expiredRequests: 2 }),
      'friends.housekeeping',
    );
  });

  it('does not overlap two passes', async () => {
    const m = makeDeps();
    let release: () => void = () => undefined;
    m.expirePendingOlderThan.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve([]);
        }),
    );
    const worker = new FriendsMaintenanceWorker(m.deps);
    const first = worker.tick(NOW);
    await worker.tick(NOW); // returns at once: a pass is running
    expect(m.expirePendingOlderThan).toHaveBeenCalledTimes(1);
    release();
    await first;
  });
});

describe('FriendsMaintenanceWorker: timer (fake timers)', () => {
  it('ticks immediately on start, then hourly, and stops cleanly', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-01T09:00:00Z'));
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const m = makeDeps();
    const worker = new FriendsMaintenanceWorker(m.deps);

    worker.start();
    worker.start(); // a second start is a no-op
    await vi.advanceTimersByTimeAsync(0);
    expect(m.expirePendingOlderThan).toHaveBeenCalledTimes(1);

    // Same UTC day: the hourly ticks find housekeeping already done.
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(m.expirePendingOlderThan).toHaveBeenCalledTimes(1);

    // Crossing midnight UTC: the next hourly tick runs housekeeping again.
    await vi.advanceTimersByTimeAsync(15 * 60 * 60 * 1000);
    expect(m.expirePendingOlderThan).toHaveBeenCalledTimes(2);

    worker.stop();
    await vi.advanceTimersByTimeAsync(48 * 60 * 60 * 1000);
    expect(m.expirePendingOlderThan).toHaveBeenCalledTimes(2);
  });
});
