import { AccessibilityInfo } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider, useMutation } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react-native';
import { resetSnackbarForTests, Snackbar } from '@chefer/ui-mobile';
import { NETWORK_ERROR_MESSAGE } from '@chefer/utils';
import { makeQueryClient } from '../../src/lib/trpc';

// WP-02 (audit §6.3): the query client's default MutationCache.onError tells
// the user about every failed mutation, unless the call site says
// `meta: { silent: true }` because it renders its own error UI.

jest.mock('../../src/lib/auth-store', () => ({
  bindSessionQueryClient: jest.fn(),
  getToken: () => 'token',
  clearToken: jest.fn(),
}));

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const badRequest = Object.assign(new Error('Name is already taken'), {
  data: { code: 'BAD_REQUEST', httpStatus: 400 },
});

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

beforeEach(() => {
  resetSnackbarForTests();
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
});
afterEach(() => {
  jest.restoreAllMocks();
  resetSnackbarForTests();
});

describe('makeQueryClient: default mutation error snackbar', () => {
  it('shows the user-facing message for a failed mutation', async () => {
    const onMutationError = jest.fn();
    const client = makeQueryClient({ onMutationError });
    await fail(client, badRequest);
    expect(onMutationError).toHaveBeenCalledWith('Name is already taken');
  });

  it('turns transport failures and Zod JSON into plain language', async () => {
    const onMutationError = jest.fn();
    const client = makeQueryClient({ onMutationError });
    await fail(client, new TypeError('Network request failed'));
    await fail(
      client,
      Object.assign(
        new Error(
          '[{"code":"too_big","maximum":1000,"path":["weightKg"],"message":"Number must be less than or equal to 1000"}]',
        ),
        { data: { code: 'BAD_REQUEST', httpStatus: 400 } },
      ),
    );
    expect(onMutationError).toHaveBeenNthCalledWith(1, NETWORK_ERROR_MESSAGE);
    expect(onMutationError).toHaveBeenNthCalledWith(2, 'Check the value you entered for weight.');
  });

  it('stays quiet for meta.silent', async () => {
    const onMutationError = jest.fn();
    const client = makeQueryClient({ onMutationError });
    await fail(client, badRequest, { silent: true });
    expect(onMutationError).not.toHaveBeenCalled();
  });

  it('stays quiet for a 401 (the app signs the user out instead)', async () => {
    const onMutationError = jest.fn();
    const client = makeQueryClient({ onMutationError, onUnauthorized: jest.fn() });
    await fail(
      client,
      Object.assign(new Error('UNAUTHORIZED'), { data: { code: 'UNAUTHORIZED', httpStatus: 401 } }),
    );
    expect(onMutationError).not.toHaveBeenCalled();
  });

  it('by default lands in the app snackbar, for a useMutation hook', async () => {
    const client = makeQueryClient();
    let mutate: (() => void) | undefined;
    function Capture() {
      const m = useMutation({
        mutationFn: () => Promise.reject(badRequest),
      });
      mutate = () => m.mutate();
      return null;
    }
    await render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <QueryClientProvider client={client}>
          <Capture />
          <Snackbar />
        </QueryClientProvider>
      </SafeAreaProvider>,
    );
    await act(async () => {
      mutate?.();
    });
    expect(screen.getByTestId('snackbar-message')).toHaveTextContent('Name is already taken');
  });

  it('a silent useMutation shows no snackbar', async () => {
    const client = makeQueryClient();
    let mutate: (() => void) | undefined;
    function Capture() {
      const m = useMutation({
        mutationFn: () => Promise.reject(badRequest),
        meta: { silent: true },
      });
      mutate = () => m.mutate();
      return null;
    }
    await render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <QueryClientProvider client={client}>
          <Capture />
          <Snackbar />
        </QueryClientProvider>
      </SafeAreaProvider>,
    );
    await act(async () => {
      mutate?.();
    });
    expect(screen.queryByTestId('snackbar')).toBeNull();
  });
});
