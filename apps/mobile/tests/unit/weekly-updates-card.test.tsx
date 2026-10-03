import { Linking } from 'react-native';
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

let mockNotificationPermission: 'granted' | 'denied' | 'undetermined' = 'undetermined';
jest.mock('../../src/lib/use-notification-permission', () => ({
  useNotificationPermission: () => mockNotificationPermission,
  refreshNotificationPermission: jest.fn(),
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
const dismissNoticeMutate = jest.fn();

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

/** T-39.3: `null` = never seen the email-defaults notice. */
function withEmailDefaultsNoticeAt(emailDefaultsNoticeAt: string | null) {
  trpc.user.me.useQuery.mockReturnValue(queryResult({ data: { emailDefaultsNoticeAt } }));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockNotificationPermission = 'undetermined';
  weekly.areWeeklyNotificationsOn.mockResolvedValue(false);
  weekly.scheduleWeeklyNotifications.mockResolvedValue(true);
  weekly.cancelWeeklyNotifications.mockResolvedValue(undefined);
  trpc.notifications.setEmailPreferences.useMutation.mockReturnValue(
    mutationResult({ mutate: saveMutate }),
  );
  trpc.notifications.resendConfirmation.useMutation.mockReturnValue(
    mutationResult({ mutate: resendMutate }),
  );
  trpc.user.dismissEmailDefaultsNotice.useMutation.mockReturnValue(
    mutationResult({ mutate: dismissNoticeMutate }),
  );
  withPrefs();
  withEmailDefaultsNoticeAt('2026-01-01T00:00:00.000Z'); // already seen, by default
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
    // UX-ACC-20: the explanation comes with a button that opens Settings.
    await waitFor(() =>
      expect(screen.getByTestId('prefs-weekly-push-off-open-settings')).toBeTruthy(),
    );
    expect(weekly.scheduleWeeklyNotifications).not.toHaveBeenCalled();
    expect(screen.getByTestId('prefs-weekly-push-switch').props.value).toBe(false);
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    await fireEvent.press(screen.getByTestId('prefs-weekly-push-off-open-settings'));
    expect(openSettings).toHaveBeenCalled();
  });

  // §6.8: with notifications denied in the OS, "On" would be a lie.
  it('notifications denied in the OS: the switch reads off and an Open Settings row shows', async () => {
    mockNotificationPermission = 'denied';
    weekly.areWeeklyNotificationsOn.mockResolvedValue(true);
    await render(<WeeklyUpdatesCard />);
    await waitFor(() => expect(weekly.areWeeklyNotificationsOn).toHaveBeenCalled());
    expect(screen.getByTestId('prefs-weekly-push-switch').props.value).toBe(false);
    expect(screen.getByTestId('prefs-weekly-push-off')).toBeTruthy();
    expect(screen.getByTestId('prefs-weekly-push-off-open-settings')).toBeTruthy();
  });

  it('notifications allowed: no Off row', async () => {
    mockNotificationPermission = 'granted';
    await render(<WeeklyUpdatesCard />);
    expect(screen.queryByTestId('prefs-weekly-push-off')).toBeNull();
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

  describe('email-defaults notice (T-39.3)', () => {
    it('stays hidden once already seen (the default)', async () => {
      await render(<WeeklyUpdatesCard />);
      expect(screen.queryByTestId('prefs-email-defaults-notice')).toBeNull();
    });

    it('stays hidden for a never-seen account whose digests are already off', async () => {
      withEmailDefaultsNoticeAt(null);
      withPrefs({ weekReady: false, weeklyRecap: false });
      await render(<WeeklyUpdatesCard />);
      expect(screen.queryByTestId('prefs-email-defaults-notice')).toBeNull();
    });

    it('shows for a never-seen account with at least one digest on', async () => {
      withEmailDefaultsNoticeAt(null);
      await render(<WeeklyUpdatesCard />);
      expect(screen.getByTestId('prefs-email-defaults-notice')).toBeTruthy();
    });

    it('"Keep them on" dismisses without touching the switches', async () => {
      withEmailDefaultsNoticeAt(null);
      await render(<WeeklyUpdatesCard />);
      await fireEvent.press(screen.getByTestId('prefs-email-defaults-keep'));
      expect(dismissNoticeMutate).toHaveBeenCalled();
      expect(saveMutate).not.toHaveBeenCalled();
    });

    it('"Turn them off" flips both switches off and dismisses', async () => {
      withEmailDefaultsNoticeAt(null);
      await render(<WeeklyUpdatesCard />);
      await fireEvent.press(screen.getByTestId('prefs-email-defaults-turn-off'));
      expect(saveMutate).toHaveBeenCalledWith({ weekReady: false, weeklyRecap: false });
      expect(dismissNoticeMutate).toHaveBeenCalled();
      expect(screen.getByTestId('prefs-weekly-email-weekReady').props.value).toBe(false);
      expect(screen.getByTestId('prefs-weekly-email-weeklyRecap').props.value).toBe(false);
    });
  });
});
