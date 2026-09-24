import { Alert } from 'react-native';
import { onlineManager } from '@tanstack/react-query';
import { screen, userEvent } from '@testing-library/react-native';
import type { SessionSummaryDto } from '@chefer/types';
import { SessionDetailScreen } from '../../src/features/gym/history/session-detail-screen';
import { gymBootstrapQueryKey } from '../../src/features/gym/use-gym-bootstrap';
import { makeBootstrap, makeExercise } from './gym-fixtures';
import { makeGymQueryClient, renderWithGym } from './gym-screen-test-utils';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn(), back: jest.fn(), canGoBack: () => false },
}));

const session: SessionSummaryDto = {
  id: 'session-1',
  name: 'Push Day',
  routineDayId: null,
  status: 'COMPLETED',
  localDate: '2026-09-10',
  startedAt: '2026-09-10T08:00:00.000Z',
  finishedAt: '2026-09-10T08:45:00.000Z',
  isDeload: false,
  exercises: [
    {
      exerciseId: 'bench',
      skipped: false,
      lastSetRir: 2,
      sets: [
        { weightKg: 40, reps: 10, isWarmup: true, completed: true },
        { weightKg: 60, reps: 8, isWarmup: false, completed: true },
        { weightKg: 60, reps: 6, isWarmup: false, completed: false },
      ],
    },
  ],
};

beforeEach(() => {
  onlineManager.setOnline(false);
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

afterEach(() => {
  onlineManager.setOnline(true);
  jest.restoreAllMocks();
});

describe('SessionDetailScreen', () => {
  it('renders offline from the cached bootstrap summary', async () => {
    const bootstrap = makeBootstrap({
      library: [makeExercise('bench', 'Bench Press')],
      recentSessions: [session],
    });
    const queryClient = makeGymQueryClient();
    queryClient.setQueryData(gymBootstrapQueryKey, bootstrap);
    await renderWithGym(<SessionDetailScreen sessionId="session-1" />, queryClient);

    expect(await screen.findByTestId('gym-session-detail')).toBeTruthy();
    expect(screen.getByText('Push Day')).toBeTruthy();
    expect(screen.getByText('Bench Press')).toBeTruthy();
    expect(screen.getByText('Warm-up')).toBeTruthy();
    expect(screen.getByText('Set 2')).toBeTruthy();
    expect(screen.getByText('Set 3')).toBeTruthy();
    expect(screen.getByText(/not done/)).toBeTruthy();
    expect(screen.getByText('RIR: 2')).toBeTruthy();
  });

  it('shows a not-found state offline for an unknown session', async () => {
    const bootstrap = makeBootstrap({ recentSessions: [] });
    const queryClient = makeGymQueryClient();
    queryClient.setQueryData(gymBootstrapQueryKey, bootstrap);
    await renderWithGym(<SessionDetailScreen sessionId="missing" />, queryClient);

    const empty = await screen.findByTestId('session-detail-not-found');
    expect(empty).toBeTruthy();
    expect(screen.getByText('Connect to load it.')).toBeTruthy();
  });

  it('confirms before deleting, mentioning the progression recalculation', async () => {
    const user = userEvent.setup();
    const bootstrap = makeBootstrap({
      library: [makeExercise('bench')],
      recentSessions: [session],
    });
    const queryClient = makeGymQueryClient();
    queryClient.setQueryData(gymBootstrapQueryKey, bootstrap);
    await renderWithGym(<SessionDetailScreen sessionId="session-1" />, queryClient);

    await user.press(await screen.findByTestId('session-detail-delete'));
    expect(Alert.alert).toHaveBeenCalledWith(
      'Delete this session?',
      expect.stringContaining('recalculated'),
      expect.any(Array),
    );
  });
});
