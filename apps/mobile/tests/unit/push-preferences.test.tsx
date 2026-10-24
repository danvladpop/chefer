import { fireEvent, screen } from '@testing-library/react-native';
import {
  PUSH_COPY,
  PUSH_PREFERENCE_AUDIENCE,
  PUSH_PREFERENCE_KEYS,
  type PushPreferencesDto,
} from '@chefer/types';
import {
  pushPreferenceKeysFor,
  PushPreferencesCard,
} from '../../src/features/notifications/push/push-preferences-card';
import { renderWithTrpc, trpcError } from './friends-core-harness';
import { settle } from './trainer-fixtures';

// Trainer mode M4 (trainer-mode.md §6.8, §7.2): one switch per push preference — Settings →
// Notifications shows the client and everyone keys, trainer You the trainer keys — once the account
// has a registered device. A flip is optimistic and rolls back when the server refuses; with the OS
// permission off, a row says so and opens the phone's Settings.

let mockPermission: 'granted' | 'denied' | 'undetermined' = 'granted';
jest.mock('../../src/lib/use-notification-permission', () => ({
  useNotificationPermission: () => mockPermission,
}));

function dto(overrides: Partial<PushPreferencesDto> = {}): PushPreferencesDto {
  return {
    hasDevice: true,
    preferences: PUSH_PREFERENCE_KEYS.map((key) => ({
      key,
      enabled: key !== 'social.follows',
      audience: PUSH_PREFERENCE_AUDIENCE[key],
    })),
    ...overrides,
  };
}

beforeEach(() => {
  mockPermission = 'granted';
});

describe('pushPreferenceKeysFor', () => {
  it('Settings: client + everyone keys (client ones only with coaching); trainer You: trainer keys', () => {
    expect(pushPreferenceKeysFor('settings', dto())).toEqual([
      'coaching.requests',
      'coaching.routine',
      'coaching.bookings',
      'coaching.reminders',
      'coaching.loggedWorkout',
      'social.follows',
    ]);
    expect(pushPreferenceKeysFor('settings', dto(), { coaching: false })).toEqual([
      'social.follows',
    ]);
    expect(pushPreferenceKeysFor('trainer', dto())).toEqual([
      'trainer.requests',
      'trainer.clients',
      'trainer.reminders',
    ]);
  });
});

describe('PushPreferencesCard', () => {
  it('Settings: "Push notifications" with a labelled switch per key, server values shown', async () => {
    await renderWithTrpc(<PushPreferencesCard screen="settings" testID="push" />, {
      'notifications.push.preferences': () => dto(),
    });
    await settle();
    expect(screen.getByText(PUSH_COPY.settings.title)).toBeOnTheScreen();
    expect(screen.getByTestId('push-coaching.reminders')).toHaveProp('value', true);
    expect(screen.getByTestId('push-social.follows')).toHaveProp('value', false);
    expect(screen.getByLabelText(PUSH_COPY.settings.labels['coaching.routine'])).toBeOnTheScreen();
    expect(screen.queryByTestId('push-trainer.requests')).toBeNull();
    expect(screen.queryByTestId('push-off')).toBeNull();
  });

  it('trainer You: "Trainer notifications" with the trainer keys only', async () => {
    await renderWithTrpc(<PushPreferencesCard screen="trainer" testID="tpush" />, {
      'notifications.push.preferences': () => dto(),
    });
    await settle();
    expect(screen.getByText(PUSH_COPY.settings.trainerTitle)).toBeOnTheScreen();
    expect(screen.getByTestId('tpush-trainer.reminders')).toBeOnTheScreen();
    expect(screen.queryByTestId('tpush-coaching.reminders')).toBeNull();
    expect(screen.queryByTestId('tpush-social.follows')).toBeNull();
  });

  it('no registered device (or no answer): nothing shown', async () => {
    await renderWithTrpc(<PushPreferencesCard screen="settings" testID="push" />, {
      'notifications.push.preferences': () => dto({ hasDevice: false }),
    });
    await settle();
    expect(screen.queryByTestId('push')).toBeNull();
  });

  it('a flip is optimistic and sends setPreference', async () => {
    let resolve: (v: unknown) => void = () => undefined;
    const r = await renderWithTrpc(<PushPreferencesCard screen="settings" testID="push" />, {
      'notifications.push.preferences': () => dto(),
      'notifications.push.setPreference': () => new Promise((res) => (resolve = res)),
    });
    await settle();
    await fireEvent(screen.getByTestId('push-coaching.reminders'), 'valueChange', false);
    await settle(2);
    expect(screen.getByTestId('push-coaching.reminders')).toHaveProp('value', false);
    expect(r.calls.find((c) => c.path === 'notifications.push.setPreference')?.input).toEqual({
      key: 'coaching.reminders',
      enabled: false,
    });
    resolve({ ok: true });
    await settle();
  });

  it('the server refuses: the switch rolls back', async () => {
    let served = dto();
    await renderWithTrpc(<PushPreferencesCard screen="trainer" testID="tpush" />, {
      'notifications.push.preferences': () => served,
      'notifications.push.setPreference': () => {
        served = dto();
        throw trpcError('INTERNAL_SERVER_ERROR', 500);
      },
    });
    await settle();
    await fireEvent(screen.getByTestId('tpush-trainer.requests'), 'valueChange', false);
    await settle(6);
    expect(screen.getByTestId('tpush-trainer.requests')).toHaveProp('value', true);
  });

  it('OS permission off: the "off in your phone’s settings" row with Open settings', async () => {
    mockPermission = 'denied';
    await renderWithTrpc(<PushPreferencesCard screen="settings" testID="push" />, {
      'notifications.push.preferences': () => dto(),
    });
    await settle();
    expect(screen.getByTestId('push-off-message')).toHaveTextContent(PUSH_COPY.settings.deviceOff);
    expect(screen.getByTestId('push-off-open-settings')).toHaveTextContent(
      PUSH_COPY.settings.openSettings,
    );
  });
});
