import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import { ModeSwitch } from '../../src/features/gym/components/mode-switch';
import { getMode, resetModeForTests, setMode } from '../../src/features/gym/mode-store';
import { createMemoryKvBackend, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import { gymBootstrapQueryKey } from '../../src/features/gym/use-gym-bootstrap';
import { trpc } from '../../src/lib/trpc';
import { makeBootstrap } from './gym-fixtures';

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn() },
}));

const { router } = jest.requireMock<{
  router: { replace: jest.Mock; push: jest.Mock };
}>('expo-router');

function renderSwitch(queryClient: QueryClient) {
  // No request is made in these tests: the bootstrap is always pre-cached.
  const client = trpc.createClient({
    links: [httpBatchLink({ url: 'http://127.0.0.1:9/trpc', transformer: superjson })],
  });
  return render(
    <trpc.Provider client={client} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <ModeSwitch />
      </QueryClientProvider>
    </trpc.Provider>,
  );
}

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false } } });
}

beforeEach(() => {
  setKvBackendForTests(createMemoryKvBackend());
  resetModeForTests();
  router.replace.mockClear();
  router.push.mockClear();
});

describe('ModeSwitch', () => {
  it('switches to Gym Today and persists the mode', async () => {
    const user = userEvent.setup();
    const queryClient = makeClient();
    queryClient.setQueryData(gymBootstrapQueryKey, makeBootstrap());
    await renderSwitch(queryClient);

    expect(screen.getByTestId('mode-switch-food')).toBeSelected();
    await user.press(screen.getByTestId('mode-switch-gym'));

    expect(getMode()).toBe('gym');
    expect(router.replace).toHaveBeenCalledWith('/today');
    expect(screen.getByTestId('mode-switch-gym')).toBeSelected();
    await waitFor(() => expect(router.push).not.toHaveBeenCalled());
  });

  it('opens Setup on top of Today when the cached bootstrap has no gym profile', async () => {
    const user = userEvent.setup();
    const queryClient = makeClient();
    queryClient.setQueryData(gymBootstrapQueryKey, makeBootstrap({ profile: null }));
    await renderSwitch(queryClient);

    await user.press(screen.getByTestId('mode-switch-gym'));
    expect(router.replace).toHaveBeenCalledWith('/today');
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/gym/setup'));
  });

  it('switches back to the food dashboard', async () => {
    const user = userEvent.setup();
    setMode('gym');
    await renderSwitch(makeClient());

    await user.press(screen.getByTestId('mode-switch-food'));
    expect(getMode()).toBe('food');
    expect(router.replace).toHaveBeenCalledWith('/');
  });
});
