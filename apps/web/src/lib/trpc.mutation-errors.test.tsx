// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NETWORK_ERROR_MESSAGE } from '@chefer/utils';
import { AppToastHost, resetAppToastForTests } from './app-toast';
import { makeQueryClient } from './trpc';

// WP-02 (audit §6.3): the default MutationCache.onError tells the user about
// every failed mutation, unless the call site says `meta: { silent: true }`
// because it renders its own error UI.

afterEach(() => {
  cleanup();
  resetAppToastForTests();
});

const badRequest = (message: string) =>
  Object.assign(new Error(message), { data: { code: 'BAD_REQUEST', httpStatus: 400 } });

async function fail(
  client: ReturnType<typeof makeQueryClient>,
  error: Error,
  meta?: { silent?: boolean },
) {
  await client
    .getMutationCache()
    .build(client, {
      gcTime: Infinity,
      mutationFn: () => Promise.reject(error),
      ...(meta ? { meta } : {}),
    })
    .execute(undefined)
    .catch(() => undefined);
}

describe('makeQueryClient: default mutation error toast', () => {
  it('shows the user-facing message for a failed mutation', async () => {
    const notify = vi.fn();
    await fail(makeQueryClient(notify), badRequest('Name is already taken'));
    expect(notify).toHaveBeenCalledWith('Name is already taken');
  });

  it('turns transport failures and Zod JSON into plain language', async () => {
    const notify = vi.fn();
    const client = makeQueryClient(notify);
    await fail(client, new TypeError('Failed to fetch'));
    await fail(
      client,
      badRequest(
        '[{"code":"too_big","maximum":1000,"path":["weightKg"],"message":"Number must be less than or equal to 1000"}]',
      ),
    );
    expect(notify).toHaveBeenNthCalledWith(1, NETWORK_ERROR_MESSAGE);
    expect(notify).toHaveBeenNthCalledWith(2, 'Check the value you entered for weight.');
  });

  it('stays quiet for meta.silent', async () => {
    const notify = vi.fn();
    await fail(makeQueryClient(notify), badRequest('Nope'), { silent: true });
    expect(notify).not.toHaveBeenCalled();
  });

  it('stays quiet for a 401 (the app redirects to /login instead)', async () => {
    const notify = vi.fn();
    await fail(
      makeQueryClient(notify),
      Object.assign(new Error('UNAUTHORIZED'), { data: { code: 'UNAUTHORIZED', httpStatus: 401 } }),
    );
    expect(notify).not.toHaveBeenCalled();
  });

  it('by default lands in the app toast host', async () => {
    render(<AppToastHost />);
    expect(screen.queryByRole('status')).toBeNull();
    await act(async () => {
      await fail(makeQueryClient(), badRequest('Name is already taken'));
    });
    expect(screen.getByRole('status').textContent).toContain('Name is already taken');
  });

  it('a silent mutation shows no toast', async () => {
    render(<AppToastHost />);
    await act(async () => {
      await fail(makeQueryClient(), badRequest('Name is already taken'), { silent: true });
    });
    expect(screen.queryByRole('status')).toBeNull();
  });
});
