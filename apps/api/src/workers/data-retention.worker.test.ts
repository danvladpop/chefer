import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AI_LOG_RETENTION_DAYS, DataRetentionWorker } from './data-retention.worker.js';

function deps() {
  return {
    sessions: { deleteExpired: vi.fn().mockResolvedValue(4) },
    aiUsage: {
      deleteOlderThan: vi.fn().mockResolvedValue(120),
      deleteCallLogsOlderThan: vi.fn().mockResolvedValue(30),
    },
  };
}

describe('DataRetentionWorker', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('prunes expired sessions and AI usage + call logs older than 90 days', async () => {
    const d = deps();
    const now = new Date('2026-10-11T03:00:00Z');
    const result = await new DataRetentionWorker(d).tick(now);
    expect(result).toEqual({ expiredSessions: 4, aiUsageEvents: 120, aiCallLogs: 30 });
    expect(d.sessions.deleteExpired).toHaveBeenCalledWith(now);
    const cutoff = new Date('2026-07-13T03:00:00Z');
    expect(AI_LOG_RETENTION_DAYS).toBe(90);
    expect(d.aiUsage.deleteOlderThan).toHaveBeenCalledWith(cutoff);
    expect(d.aiUsage.deleteCallLogsOlderThan).toHaveBeenCalledWith(cutoff);
  });

  it('runs once per UTC day', async () => {
    const d = deps();
    const worker = new DataRetentionWorker(d);
    await worker.tick(new Date('2026-10-11T03:00:00Z'));
    expect(await worker.tick(new Date('2026-10-11T04:00:00Z'))).toBeNull();
    await worker.tick(new Date('2026-10-12T00:30:00Z'));
    expect(d.sessions.deleteExpired).toHaveBeenCalledTimes(2);
  });

  it('a failed step does not stop the others, and the day is retried', async () => {
    const d = deps();
    d.sessions.deleteExpired.mockRejectedValueOnce(new Error('db blip'));
    const worker = new DataRetentionWorker(d);
    await worker.tick(new Date('2026-10-11T03:00:00Z'));
    expect(d.aiUsage.deleteOlderThan).toHaveBeenCalledTimes(1);
    expect(d.aiUsage.deleteCallLogsOlderThan).toHaveBeenCalledTimes(1);
    await worker.tick(new Date('2026-10-11T04:00:00Z'));
    expect(d.sessions.deleteExpired).toHaveBeenCalledTimes(2);
  });
});
