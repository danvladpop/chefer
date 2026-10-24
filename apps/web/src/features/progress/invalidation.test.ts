import { makeQueryClient } from '@/lib/trpc';
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { invalidateProgress, isProgressTrigger } from './invalidation';

describe('isProgressTrigger', () => {
  it.each([
    [[['tracker', 'logRecipe']], true],
    [[['tracker', 'skipSlot']], true],
    [[['shoppingList', 'toggleItems']], true],
    [[['progress', 'finishCook']], true],
    [[['shoppingList', 'addItem']], false],
    [[['progress', 'ack']], false],
    [[['mealPlan', 'swapRecipe']], false],
    [undefined, false],
    [[], false],
  ])('%j → %s', (key, expected) => {
    expect(isProgressTrigger(key)).toBe(expected);
  });
});

describe('invalidateProgress', () => {
  it('marks progress.summary and progress.inbox queries stale, and nothing else', () => {
    const client = new QueryClient();
    client.setQueryData(
      [['progress', 'summary'], { input: { localDate: '2026-10-22' }, type: 'query' }],
      1,
    );
    client.setQueryData([['progress', 'inbox'], { type: 'query' }], 1);
    client.setQueryData([['progress', 'achievements'], { type: 'query' }], 1);
    client.setQueryData([['dashboard', 'summary'], { type: 'query' }], 1);
    invalidateProgress(client);
    const stale = (key: unknown[]) => client.getQueryState(key)?.isInvalidated;
    expect(
      stale([['progress', 'summary'], { input: { localDate: '2026-10-22' }, type: 'query' }]),
    ).toBe(true);
    expect(stale([['progress', 'inbox'], { type: 'query' }])).toBe(true);
    expect(stale([['progress', 'achievements'], { type: 'query' }])).toBeFalsy();
    expect(stale([['dashboard', 'summary'], { type: 'query' }])).toBeFalsy();
  });
});

describe('makeQueryClient: mutation cache', () => {
  async function succeed(client: QueryClient, mutationKey: unknown[]) {
    await client
      .getMutationCache()
      .build(client, { mutationKey, mutationFn: () => Promise.resolve('ok'), gcTime: Infinity })
      .execute(undefined);
  }

  it('refreshes progress after a log, a shopping tick or a finished cook', async () => {
    for (const key of [
      ['tracker', 'logRecipe'],
      ['shoppingList', 'toggleItems'],
      ['progress', 'finishCook'],
    ]) {
      const client = makeQueryClient(vi.fn());
      const spy = vi.spyOn(client, 'invalidateQueries');
      await succeed(client, [key]);
      expect(spy).toHaveBeenCalledWith({ queryKey: [['progress', 'summary']] });
      expect(spy).toHaveBeenCalledWith({ queryKey: [['progress', 'inbox']] });
    }
  });

  it('leaves progress alone after an unrelated mutation', async () => {
    const client = makeQueryClient(vi.fn());
    const spy = vi.spyOn(client, 'invalidateQueries');
    await succeed(client, [['mealPlan', 'swapRecipe']]);
    expect(spy).not.toHaveBeenCalled();
  });
});
