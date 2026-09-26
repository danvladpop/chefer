import { describe, expect, it } from 'vitest';
import { getAiCallContext, runOutsideAiCallContext, runWithAiCallContext } from './call-context.js';

describe('AI call context', () => {
  it('is visible across awaits inside the request, and absent outside it', async () => {
    expect(getAiCallContext()).toBeUndefined();
    await runWithAiCallContext({ userId: 'u1', premium: true }, async () => {
      await Promise.resolve();
      expect(getAiCallContext()).toEqual({ userId: 'u1', premium: true });
    });
    expect(getAiCallContext()).toBeUndefined();
  });

  it('timers started from a request can be detached (worker wake-ups)', async () => {
    const seen = await runWithAiCallContext({ userId: 'u1', premium: true }, () =>
      Promise.all([
        new Promise((resolve) => setTimeout(() => resolve(getAiCallContext()), 0)),
        new Promise((resolve) =>
          runOutsideAiCallContext(() => setTimeout(() => resolve(getAiCallContext()), 0)),
        ),
      ]),
    );
    expect(seen[0]).toEqual({ userId: 'u1', premium: true });
    expect(seen[1]).toBeUndefined();
  });
});
