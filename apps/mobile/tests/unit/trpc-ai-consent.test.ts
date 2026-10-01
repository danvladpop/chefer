import { onAiConsentRequired } from '@chefer/utils';
import { makeQueryClient } from '../../src/lib/trpc';

// R-10: a mutation the API refuses for missing AI consent reaches the consent
// provider (which reopens the sheet) through the query client's mutation cache.
// Mirrors apps/web/src/lib/trpc.ai-consent.test.ts.

jest.mock('../../src/lib/auth-store', () => ({
  clearToken: jest.fn(),
  getToken: () => null,
}));

async function failWith(error: Error, path: [string, string]) {
  const client = makeQueryClient();
  await client
    .getMutationCache()
    .build(client, {
      mutationKey: [path],
      // No garbage-collection timer, so the test process can exit.
      gcTime: Infinity,
      mutationFn: () => Promise.reject(error),
    })
    .execute(undefined)
    .catch(() => undefined);
}

describe('makeQueryClient — AI consent rejection', () => {
  it('notifies the provider with the refused procedure’s feature', async () => {
    const listener = jest.fn();
    const off = onAiConsentRequired(listener);
    await failWith(
      Object.assign(new Error('Allow AI features…'), {
        data: { code: 'FORBIDDEN', reason: 'AI_CONSENT_REQUIRED' },
      }),
      ['mealPlan', 'swapRecipe'],
    );
    expect(listener).toHaveBeenCalledWith('meal-swap');
    off();
  });

  it('ignores every other failure', async () => {
    const listener = jest.fn();
    const off = onAiConsentRequired(listener);
    await failWith(
      Object.assign(new Error('premium'), { data: { code: 'FORBIDDEN', reason: null } }),
      ['mealPlan', 'swapRecipe'],
    );
    expect(listener).not.toHaveBeenCalled();
    off();
  });
});
