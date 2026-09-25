import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react-native';
import { resetModeForTests } from '../../src/features/gym/mode-store';
import { createMemoryKvBackend, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import { TodaysWorkoutCard } from '../../src/features/gym/today/todays-workout-card';
import { gymBootstrapQueryKey } from '../../src/features/gym/use-gym-bootstrap';
import { makeBootstrap } from './gym-fixtures';

// `useGymReminders()` (mounted inside TodaysWorkoutCard — gym_plan.md §6.5)
// cancels and reschedules gym notifications whenever the bootstrap's
// reminder-relevant fields change. These tests mock `expo-notifications`
// directly (there's no native module under Jest) and drive the effect
// through the dashboard card, exactly like the app does.
//
// The mock jest.fn()s are created INSIDE the factory (not closed over from
// outer `const`s) and read back via `jest.requireMock` — outer "mock"-
// prefixed variables are only guaranteed not to trip the jest-hoist
// out-of-scope check, not to be INITIALIZED yet by the time the factory
// first runs (it runs as soon as something transitively requires
// 'expo-notifications', which can happen while this file's own top-level
// `const`s are still mid-evaluation). See gym-dashboard-card.test.tsx for
// the same require()-based pattern used for the tRPC mock.
jest.mock('expo-notifications', () => ({
  __esModule: true,
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getAllScheduledNotificationsAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  SchedulableTriggerInputTypes: { DATE: 'date' },
  AndroidImportance: { DEFAULT: 3 },
}));
jest.mock('../../src/lib/trpc', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- see gym-dashboard-card.test.tsx
  const mock = require('./gym-trpc-mock') as typeof import('./gym-trpc-mock');
  return mock.createTrpcGymMock();
});
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() } }));

const Notifications = jest.requireMock<{
  getPermissionsAsync: jest.Mock;
  requestPermissionsAsync: jest.Mock;
  getAllScheduledNotificationsAsync: jest.Mock;
  cancelScheduledNotificationAsync: jest.Mock;
  scheduleNotificationAsync: jest.Mock;
  setNotificationChannelAsync: jest.Mock;
}>('expo-notifications');

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false } } });
}

function renderCard(queryClient: QueryClient) {
  return render(
    <QueryClientProvider client={queryClient}>
      <TodaysWorkoutCard />
    </QueryClientProvider>,
  );
}

const ROUTINE = {
  id: 'r1',
  name: 'Upper/Lower',
  templateKey: null,
  isActive: true,
  nextDayId: 'day-a',
  version: 1,
  archived: false,
  updatedAt: '2026-09-01T00:00:00.000Z',
  days: [
    { id: 'day-a', position: 0, name: 'Upper A', plannedWeekday: 4, exercises: [] }, // Friday
  ],
};

const PROFILE_BASE = {
  experience: 'BEGINNER' as const,
  equipmentAccess: 'FULL_GYM' as const,
  unit: 'KG' as const,
  weeklyGoal: 3,
  barWeightKg: 20,
  platePairsKg: [],
  dumbbellsKg: [],
  machineStepKg: 5,
  cableStepKg: 2.5,
  hasDipBelt: false,
  microPlates: false,
  setupCompletedAt: '2026-09-01T00:00:00.000Z',
};

beforeEach(() => {
  jest.clearAllMocks();
  setKvBackendForTests(createMemoryKvBackend());
  resetModeForTests();
  Notifications.getAllScheduledNotificationsAsync.mockResolvedValue([]);
  Notifications.cancelScheduledNotificationAsync.mockResolvedValue(undefined);
  Notifications.scheduleNotificationAsync.mockResolvedValue('notif-id');
  Notifications.setNotificationChannelAsync.mockResolvedValue(undefined);
});

describe('useGymReminders (via TodaysWorkoutCard)', () => {
  it('schedules a reminder once permission is already granted', async () => {
    Notifications.getPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true });
    const queryClient = makeClient();
    queryClient.setQueryData(
      gymBootstrapQueryKey,
      makeBootstrap({
        activeRoutine: ROUTINE,
        profile: { ...PROFILE_BASE, reminderEnabled: true, reminderTime: '18:00' },
      }),
    );
    await renderCard(queryClient);

    await waitFor(() => expect(Notifications.scheduleNotificationAsync).toHaveBeenCalled());
    expect(Notifications.getAllScheduledNotificationsAsync).toHaveBeenCalled();
    expect(Notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalled(); // nothing was scheduled yet
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled(); // never prompts from the effect
  });

  it('never schedules, and never prompts, when permission was not granted', async () => {
    Notifications.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true });
    const queryClient = makeClient();
    queryClient.setQueryData(
      gymBootstrapQueryKey,
      makeBootstrap({
        activeRoutine: ROUTINE,
        profile: { ...PROFILE_BASE, reminderEnabled: true, reminderTime: '18:00' },
      }),
    );
    await renderCard(queryClient);

    await waitFor(() => expect(Notifications.getAllScheduledNotificationsAsync).toHaveBeenCalled());
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('only cancels (cleanup), and never schedules, when reminders are turned off', async () => {
    Notifications.getPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true });
    Notifications.getAllScheduledNotificationsAsync.mockResolvedValue([
      { identifier: 'stale-1', content: { data: { app: 'gym-reminder' } } },
      { identifier: 'other', content: { data: { app: 'gym-rest-timer' } } },
    ]);
    const queryClient = makeClient();
    queryClient.setQueryData(
      gymBootstrapQueryKey,
      makeBootstrap({
        activeRoutine: ROUTINE,
        profile: { ...PROFILE_BASE, reminderEnabled: false, reminderTime: null },
      }),
    );
    await renderCard(queryClient);

    await waitFor(() =>
      expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('stale-1'),
    );
    expect(Notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalledWith('other');
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
});
