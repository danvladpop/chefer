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

jest.mock('../../src/lib/trpc', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- see gym-dashboard-card.test.tsx
  const mock = require('./gym-trpc-mock') as typeof import('./gym-trpc-mock');
  return mock.createTrpcGymMock();
});
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() } }));

const mockGetPermissionsAsync = jest.fn();
const mockRequestPermissionsAsync = jest.fn();
const mockGetAllScheduledNotificationsAsync = jest.fn();
const mockCancelScheduledNotificationAsync = jest.fn();
const mockScheduleNotificationAsync = jest.fn();
const mockSetNotificationChannelAsync = jest.fn();

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: mockGetPermissionsAsync,
  requestPermissionsAsync: mockRequestPermissionsAsync,
  getAllScheduledNotificationsAsync: mockGetAllScheduledNotificationsAsync,
  cancelScheduledNotificationAsync: mockCancelScheduledNotificationAsync,
  scheduleNotificationAsync: mockScheduleNotificationAsync,
  setNotificationChannelAsync: mockSetNotificationChannelAsync,
  SchedulableTriggerInputTypes: { DATE: 'date' },
  AndroidImportance: { DEFAULT: 3 },
}));

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
  mockGetAllScheduledNotificationsAsync.mockResolvedValue([]);
  mockCancelScheduledNotificationAsync.mockResolvedValue(undefined);
  mockScheduleNotificationAsync.mockResolvedValue('notif-id');
  mockSetNotificationChannelAsync.mockResolvedValue(undefined);
});

describe('useGymReminders (via TodaysWorkoutCard)', () => {
  it('schedules a reminder once permission is already granted', async () => {
    mockGetPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true });
    const queryClient = makeClient();
    queryClient.setQueryData(
      gymBootstrapQueryKey,
      makeBootstrap({
        activeRoutine: ROUTINE,
        profile: { ...PROFILE_BASE, reminderEnabled: true, reminderTime: '18:00' },
      }),
    );
    await renderCard(queryClient);

    await waitFor(() => expect(mockScheduleNotificationAsync).toHaveBeenCalled());
    expect(mockGetAllScheduledNotificationsAsync).toHaveBeenCalled();
    expect(mockCancelScheduledNotificationAsync).not.toHaveBeenCalled(); // nothing was scheduled yet
    expect(mockRequestPermissionsAsync).not.toHaveBeenCalled(); // never prompts from the effect
  });

  it('never schedules, and never prompts, when permission was not granted', async () => {
    mockGetPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true });
    const queryClient = makeClient();
    queryClient.setQueryData(
      gymBootstrapQueryKey,
      makeBootstrap({
        activeRoutine: ROUTINE,
        profile: { ...PROFILE_BASE, reminderEnabled: true, reminderTime: '18:00' },
      }),
    );
    await renderCard(queryClient);

    await waitFor(() => expect(mockGetAllScheduledNotificationsAsync).toHaveBeenCalled());
    expect(mockScheduleNotificationAsync).not.toHaveBeenCalled();
    expect(mockRequestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('only cancels (cleanup), and never schedules, when reminders are turned off', async () => {
    mockGetPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true });
    mockGetAllScheduledNotificationsAsync.mockResolvedValue([
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
      expect(mockCancelScheduledNotificationAsync).toHaveBeenCalledWith('stale-1'),
    );
    expect(mockCancelScheduledNotificationAsync).not.toHaveBeenCalledWith('other');
    expect(mockScheduleNotificationAsync).not.toHaveBeenCalled();
  });
});
