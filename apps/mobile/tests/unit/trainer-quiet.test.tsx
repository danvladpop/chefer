import { Platform } from 'react-native';
import { onlineManager } from '@tanstack/react-query';
import { screen, userEvent } from '@testing-library/react-native';
import { QUIET_COPY } from '@chefer/types';
import { resetEntrancesForTests, resetSnackbarForTests } from '@chefer/ui-mobile';
import { createMemoryKvBackend, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import { resetShellModeStoreForTests } from '../../src/features/trainer-mode/mode-store';
import { TrainerTodayScreen } from '../../src/features/trainer-mode/today/trainer-today-screen';
import { ClientRow } from '../../src/features/trainer/components/client-row';
import { TrainerAlertsCard } from '../../src/features/trainer/home/trainer-alerts-card';
import { renderWithTrpc } from './friends-core-harness';
import { clientRow, settle } from './trainer-fixtures';
import { badges, summary, trainerModeHandlers } from './trainer-mode-fixtures';

// Lane K4: "client went quiet" — the server's verdict by the trainer's own N, Today marks the quiet
// clients seen (the Today tab's badge starts over), and the alerts settings.

jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't close over imports
  const { useEffect } = require('react') as typeof import('react');
  return {
    router: {
      push: jest.fn(),
      navigate: jest.fn(),
      replace: jest.fn(),
      back: jest.fn(),
      canGoBack: () => true,
    },
    useFocusEffect: (effect: () => void) => {
      useEffect(effect, [effect]);
    },
  };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

beforeEach(() => {
  jest.clearAllMocks();
  setKvBackendForTests(createMemoryKvBackend());
  resetShellModeStoreForTests();
  resetSnackbarForTests();
  resetEntrancesForTests();
  onlineManager.setOnline(true);
  jest.replaceProperty(Platform, 'OS', 'android');
});
afterEach(() => jest.restoreAllMocks());

describe('went quiet (lane K4)', () => {
  it('a client row follows the server verdict (3 days by the trainer’s N), not the old 7-day rule', async () => {
    await renderWithTrpc(
      <ClientRow row={clientRow({ inactiveDays: 3, quiet: true, quietDays: 3 })} />,
      {},
    );
    expect(screen.getByText('Nothing logged for 3 days')).toBeTruthy();
  });

  it('Today shows the threshold in the hint, and marks quiet clients seen when it has a badge', async () => {
    const r = await renderWithTrpc(
      <TrainerTodayScreen />,
      trainerModeHandlers({
        'trainer.badges': () => ({ ...badges(), quietClients: 2 }),
        'trainer.dashboard.summary': () =>
          summary({
            quietAfterDays: 3,
            quietClients: [
              { clientId: 'c1', name: 'Maria', lastWorkoutDate: '2026-10-15', inactiveDays: 4 },
            ],
          }),
        'trainer.quiet.markSeen': () => ({ ok: true }),
      }),
    );
    await settle();
    expect(screen.getByTestId('trainer-today-stat-quiet').props.accessibilityHint).toBe(
      QUIET_COPY.statHint(3),
    );
    expect(screen.getByText(QUIET_COPY.row(4))).toBeTruthy();
    expect(r.paths()).toContain('trainer.quiet.markSeen');
    const badgesInput = r.calls.find((c) => c.path === 'trainer.badges')?.input as {
      today?: string;
    };
    expect(badgesInput.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('settings: pick N and the digest, save', async () => {
    const user = userEvent.setup();
    let saved: unknown = null;
    await renderWithTrpc(<TrainerAlertsCard />, {
      'trainer.alerts.config': () => ({ quietAfterDays: 3, digestEmail: false }),
      'trainer.alerts.saveConfig': (input) => {
        saved = input;
        return input;
      },
    });
    await settle();
    await user.press(screen.getByTestId('trainer-alerts-days-5'));
    await user.press(screen.getByTestId('trainer-alerts-save'));
    await settle();
    expect(saved).toEqual({ quietAfterDays: 5, digestEmail: false });
  });
});
