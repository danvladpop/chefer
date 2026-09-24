import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, userEvent } from '@testing-library/react-native';
import { getMode, resetModeForTests } from '../../src/features/gym/mode-store';
import { createMemoryKvBackend, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import { TodaysWorkoutCard } from '../../src/features/gym/today/todays-workout-card';
import { gymBootstrapQueryKey } from '../../src/features/gym/use-gym-bootstrap';
import { makeBootstrap } from './gym-fixtures';

// `TodaysWorkoutCard` (imported above) transitively imports
// `../../src/lib/trpc` BEFORE this file's own `./gym-trpc-mock` import would
// run, so the factory can't reference an imported binding — it has to
// `require()` lazily, right when Jest first asks for the mocked module.
jest.mock('../../src/lib/trpc', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- see comment above
  const mock = require('./gym-trpc-mock') as typeof import('./gym-trpc-mock');
  return mock.createTrpcGymMock();
});
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() } }));

const { router } = jest.requireMock<{ router: { push: jest.Mock } }>('expo-router');

function renderCard(queryClient: QueryClient) {
  return render(
    <QueryClientProvider client={queryClient}>
      <TodaysWorkoutCard />
    </QueryClientProvider>,
  );
}

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false } } });
}

beforeEach(() => {
  jest.clearAllMocks();
  setKvBackendForTests(createMemoryKvBackend());
  resetModeForTests();
});

describe('TodaysWorkoutCard', () => {
  it('renders nothing before the bootstrap has loaded', async () => {
    const queryClient = makeClient();
    await renderCard(queryClient);
    expect(screen.queryByTestId('todays-workout-card')).not.toBeOnTheScreen();
  });

  it('invites setup when there is no gym profile', async () => {
    const queryClient = makeClient();
    queryClient.setQueryData(gymBootstrapQueryKey, makeBootstrap({ profile: null }));
    const user = userEvent.setup();
    await renderCard(queryClient);

    expect(screen.getByTestId('todays-workout-card-label')).toHaveTextContent(
      'Start training — set up in 90 seconds',
    );
    await user.press(screen.getByTestId('todays-workout-card'));
    expect(getMode()).toBe('gym');
    expect(router.push).toHaveBeenCalledWith('/today');
  });

  it('shows the next day name and the week ring', async () => {
    const queryClient = makeClient();
    queryClient.setQueryData(
      gymBootstrapQueryKey,
      makeBootstrap({
        nextWorkout: {
          routineId: 'r1',
          dayId: 'd1',
          dayName: 'Upper A',
          isDeload: false,
          estimatedMin: 40,
          exercises: [],
        },
        streak: { current: 1, best: 1, flexTokens: 0, thisWeekSessions: 1, thisWeekGoal: 3 },
      }),
    );
    await renderCard(queryClient);
    expect(screen.getByTestId('todays-workout-card-label')).toHaveTextContent('Upper A');
    expect(screen.getByTestId('todays-workout-card-ring')).toBeOnTheScreen();
  });

  it('shows "Done ✓" once the weekly goal is met and nothing is next', async () => {
    const queryClient = makeClient();
    queryClient.setQueryData(
      gymBootstrapQueryKey,
      makeBootstrap({
        nextWorkout: null,
        streak: { current: 1, best: 1, flexTokens: 0, thisWeekSessions: 3, thisWeekGoal: 3 },
      }),
    );
    await renderCard(queryClient);
    expect(screen.getByTestId('todays-workout-card-label')).toHaveTextContent('Done ✓');
  });
});
