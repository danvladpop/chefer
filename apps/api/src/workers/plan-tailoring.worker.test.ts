import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAiCallContext, runWithAiCallContext } from '../lib/ai/call-context.js';
import { notifyTailoringQueued } from '../lib/plan-tailoring-signal.js';
import { PlanTailoringWorker } from './plan-tailoring.worker.js';

vi.mock('../application/meal-plan/plan-tailoring.service.js', () => ({
  planTailoringService: { runNext: vi.fn().mockResolvedValue(false) },
}));

describe('PlanTailoringWorker', () => {
  let worker: PlanTailoringWorker | null = null;

  afterEach(async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await worker?.stop();
    worker = null;
  });

  it('a pass drains every due step, one at a time, then stops', async () => {
    const runNext = vi
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    worker = new PlanTailoringWorker({ runNext });
    await worker.tick();
    expect(runNext).toHaveBeenCalledTimes(3);
  });

  it('a queued job wakes it immediately — outside the requesting user’s AI context', async () => {
    const seen: unknown[] = [];
    const runNext = vi.fn(async () => {
      seen.push(getAiCallContext());
      return false;
    });
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    worker = new PlanTailoringWorker({ runNext });
    worker.start();
    await vi.waitFor(() => expect(runNext).toHaveBeenCalledTimes(1));

    runWithAiCallContext({ userId: 'u1', premium: true }, () => notifyTailoringQueued());
    await vi.waitFor(() => expect(runNext).toHaveBeenCalledTimes(2));
    expect(seen[1]).toBeUndefined();
  });

  it('a failing step never crashes the pass', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const runNext = vi.fn().mockRejectedValueOnce(new Error('db down'));
    worker = new PlanTailoringWorker({ runNext });
    await expect(worker.tick()).resolves.toBeUndefined();
  });

  it('stop waits for the in-flight day', async () => {
    let finish: (v: boolean) => void = () => undefined;
    const runNext = vi.fn(() => new Promise<boolean>((resolve) => (finish = resolve)));
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    worker = new PlanTailoringWorker({ runNext });
    const pass = worker.tick();
    let stopped = false;
    const stopping = worker.stop().then(() => (stopped = true));
    await Promise.resolve();
    expect(stopped).toBe(false);
    finish(true);
    await stopping;
    await pass;
    expect(stopped).toBe(true);
    // Stopping means no further step is claimed.
    expect(runNext).toHaveBeenCalledTimes(1);
    worker = null;
  });
});
