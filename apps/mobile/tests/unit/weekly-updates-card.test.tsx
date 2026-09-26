import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { WeeklyUpdatesCard } from '../../src/features/preferences/weekly-updates-card';
import type { createTrpcPreferencesMock } from './preferences-trpc-mock';
import { mutationResult, queryResult } from './preferences-trpc-mock';

// Audit P2-5: weekly emails (server switches) + this phone's local weekly
// notifications. Permission is asked from the switch, never on mount.

jest.mock('../../src/lib/trpc', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- factory runs before imports resolve
  const mock = require('./preferences-trpc-mock') as typeof import('./preferences-trpc-mock');
  return mock.createTrpcPreferencesMock();
});
jest.mock('../../src/features/gym/reminders/permission', () => ({
  ensureGymReminderPermission: jest.fn(),
}));
jest.mock('../../src/features/notifications/weekly-notifications', () => ({
  areWeeklyNotificationsOn: jest.fn(),
  scheduleWeeklyNotifications: jest.fn(),
  cancelWeeklyNotifications: jest.fn(),
}));

const { trpc } =
  jest.requireMock<ReturnType<typeof createTrpcPreferencesMock>>('../../src/lib/trpc');
const permission = jest.requireMock<{ ensureGymReminderPermission: jest.Mock }>(
  '../../src/features/gym/reminders/permission',
);
const weekly = jest.requireMock<{
  areWeeklyNotificationsOn: jest.Mock;
  scheduleWeeklyNotifications: jest.Mock;
  cancelWeeklyNotifications: jest.Mock;
}>('../../src/features/notifications/weekly-notifications');

const saveMutate = jest.fn();
const resendMutate = jest.fn();

function withPrefs(overrides: Record<string, unknown> = {}) {
  trpc.notifications.getEmailPreferences.useQuery.mockReturnValue(
    queryResult({
      data: {
        weekReady: true,
        weeklyRecap: true,
        emailConfirmed: true,
        email: 'ana@chefer.dev',
        ...overrides,
      },
    }),
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  weekly.areWeeklyNotificationsOn.mockResolvedValue(false);
  weekly.scheduleWeeklyNotifications.mockResolvedValue(true);
  weekly.cancelWeeklyNotifications.mockResolvedValue(undefined);
  trpc.notifications.setEmailPreferences.useMutation.mockReturnValue(
    mutationResult({ mutate: saveMutate }),
  );
  trpc.notifications.resendConfirmation.useMutation.mockReturnValue(
    mutationResult({ mutate: resendMutate }),
  );
  withPrefs();
});

describe('WeeklyUpdatesCard', () => {
  it('never asks for notification permission on mount', async () => {
    await render(<WeeklyUpdatesCard />);
    await waitFor(() => expect(weekly.areWeeklyNotificationsOn).toHaveBeenCalled());
    expect(permission.ensureGymReminderPermission).not.toHaveBeenCalled();
  });

  it('turning the phone switch on asks, then schedules', async () => {
    permission.ensureGymReminderPermission.mockResolvedValue(true);
    await render(<WeeklyUpdatesCard />);
    await fireEvent(screen.getByTestId('prefs-weekly-push-switch'), 'valueChange', true);
    await waitFor(() => expect(weekly.scheduleWeeklyNotifications).toHaveBeenCalled());
    expect(permission.ensureGymReminderPermission).toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByTestId('prefs-weekly-push-switch').props.value).toBe(true),
    );
  });

  it('a denied permission explains and stays off', async () => {
    permission.ensureGymReminderPermission.mockResolvedValue(false);
    await render(<WeeklyUpdatesCard />);
    await fireEvent(screen.getByTestId('prefs-weekly-push-switch'), 'valueChange', true);
    await waitFor(() =>
      expect(screen.getByText(/Turn them on in your phone's Settings/)).toBeTruthy(),
    );
    expect(weekly.scheduleWeeklyNotifications).not.toHaveBeenCalled();
    expect(screen.getByTestId('prefs-weekly-push-switch').props.value).toBe(false);
  });

  it('turning it off cancels', async () => {
    weekly.areWeeklyNotificationsOn.mockResolvedValue(true);
    await render(<WeeklyUpdatesCard />);
    await waitFor(() =>
      expect(screen.getByTestId('prefs-weekly-push-switch').props.value).toBe(true),
    );
    await fireEvent(screen.getByTestId('prefs-weekly-push-switch'), 'valueChange', false);
    await waitFor(() => expect(weekly.cancelWeeklyNotifications).toHaveBeenCalled());
  });

  it('the Sunday email switch saves only the recap', async () => {
    await render(<WeeklyUpdatesCard />);
    await fireEvent(screen.getByTestId('prefs-weekly-email-weeklyRecap'), 'valueChange', false);
    expect(saveMutate).toHaveBeenCalledWith({ weeklyRecap: false });
    expect(screen.getByTestId('prefs-weekly-email-weekReady').props.value).toBe(true);
  });

  it('an unconfirmed address can request the confirmation link', async () => {
    withPrefs({ emailConfirmed: false });
    await render(<WeeklyUpdatesCard />);
    await fireEvent.press(screen.getByTestId('prefs-weekly-email-confirm'));
    expect(resendMutate).toHaveBeenCalled();
  });
});
