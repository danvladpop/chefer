import { Platform } from 'react-native';
import { onlineManager } from '@tanstack/react-query';
import { screen, userEvent } from '@testing-library/react-native';
import { resetEntrancesForTests, resetSnackbarForTests } from '@chefer/ui-mobile';
import { createMemoryKvBackend, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import { resetShellModeStoreForTests } from '../../src/features/trainer-mode/mode-store';
import { TrainerTodayScreen } from '../../src/features/trainer-mode/today/trainer-today-screen';
import { renderWithTrpc, trpcError } from './friends-core-harness';
import { MARIA, settle } from './trainer-fixtures';
import { badges, summary, trainerModeHandlers } from './trainer-mode-fixtures';

// Trainer Today (trainer-mode.md §6.1, M1): requests card, "This week", "Needs attention", the
// brand-new trainer's welcome.

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

const { router } = jest.requireMock<{ router: { push: jest.Mock; navigate: jest.Mock } }>(
  'expo-router',
);

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

describe('Trainer Today', () => {
  it('asks for the summary with the device date and shows This week', async () => {
    const r = await renderWithTrpc(<TrainerTodayScreen />, trainerModeHandlers());
    await settle();
    const input = r.calls.find((c) => c.path === 'trainer.dashboard.summary')?.input as {
      today?: string;
    };
    expect(input.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(screen.getByTestId('trainer-today-stat-clients')).toHaveAccessibleName(
      'Active clients: 23 of 50',
    );
    expect(screen.getByTestId('trainer-today-stat-adherence')).toHaveAccessibleName(
      'Average adherence: 67%',
    );
    expect(screen.getByTestId('trainer-today-stat-quiet')).toHaveAccessibleName('Quiet clients: 1');
    // No booking stat in M1.
    expect(screen.queryByText('Bookings this week')).toBeNull();
  });

  it('no request waiting: no requests card', async () => {
    await renderWithTrpc(<TrainerTodayScreen />, trainerModeHandlers());
    await settle();
    expect(screen.queryByTestId('trainer-today-requests-card')).toBeNull();
  });

  it('requests waiting: the card, and Review opens Clients', async () => {
    const user = userEvent.setup();
    await renderWithTrpc(
      <TrainerTodayScreen />,
      trainerModeHandlers({
        'trainer.badges': () => badges({ requests: 2 }),
        'trainer.dashboard.summary': () => summary({ requestsWaiting: 2 }),
      }),
    );
    await settle();
    expect(screen.getByTestId('trainer-today-requests-text')).toHaveTextContent(
      '2 people asked you to coach them',
    );
    await user.press(screen.getByTestId('trainer-today-review'));
    expect(router.navigate).toHaveBeenCalledWith('/(trainer)/clients');
  });

  it('the polled badge wins over a summary that is behind', async () => {
    await renderWithTrpc(
      <TrainerTodayScreen />,
      trainerModeHandlers({
        'trainer.badges': () => badges({ requests: 1 }),
        'trainer.dashboard.summary': () => summary({ requestsWaiting: 0 }),
      }),
    );
    await settle();
    expect(screen.getByTestId('trainer-today-requests-text')).toHaveTextContent(
      '1 person asked you to coach them',
    );
  });

  it('Needs attention lists quiet clients; a tap opens the client', async () => {
    const user = userEvent.setup();
    await renderWithTrpc(<TrainerTodayScreen />, trainerModeHandlers());
    await settle();
    const row = screen.getByTestId(`trainer-today-quiet-${MARIA}`);
    expect(row).toHaveAccessibleName(
      /^Maria Pop\. Last workout .+ 9 Oct\. 9 days without a workout$/,
    );
    await user.press(row);
    expect(router.push).toHaveBeenCalledWith(`/trainer/${MARIA}`);
    expect(screen.queryByTestId('trainer-today-caught-up')).toBeNull();
  });

  it('nothing quiet and no notices: "Nothing needs you right now."; no goals: "No goals yet"', async () => {
    await renderWithTrpc(
      <TrainerTodayScreen />,
      trainerModeHandlers({
        'trainer.dashboard.summary': () => summary({ quietClients: [], averageAdherence: null }),
      }),
    );
    await settle();
    expect(screen.getByTestId('trainer-today-caught-up')).toHaveTextContent(
      'Nothing needs you right now.',
    );
    expect(screen.getByTestId('trainer-today-no-adherence')).toHaveTextContent('No goals yet');
    expect(screen.getByTestId('trainer-today-stat-quiet')).toHaveAccessibleName('Quiet clients: 0');
  });

  it('a brand-new trainer gets the welcome: invite (a sheet) and build a template', async () => {
    const user = userEvent.setup();
    await renderWithTrpc(
      <TrainerTodayScreen />,
      trainerModeHandlers({
        'trainer.dashboard.summary': () =>
          summary({ activeClients: 0, quietClients: [], averageAdherence: null }),
      }),
    );
    await settle();
    expect(screen.getByTestId('trainer-today-welcome')).toBeTruthy();
    expect(screen.getByText('Welcome to trainer mode')).toBeTruthy();
    expect(screen.queryByTestId('trainer-today-stats')).toBeNull();
    expect(screen.queryByTestId('trainer-today-attention')).toBeNull();
    await user.press(screen.getByTestId('trainer-today-build-template'));
    expect(router.push).toHaveBeenCalledWith('/trainer/templates/new');
    await user.press(screen.getByTestId('trainer-today-invite'));
    await settle();
    expect(screen.getByTestId('trainer-invite-sheet-title')).toHaveTextContent('Invite a client');
    expect(screen.getByTestId('trainer-invite-create')).toBeTruthy();
  });

  it('a failed load shows Retry', async () => {
    await renderWithTrpc(
      <TrainerTodayScreen />,
      trainerModeHandlers({
        'trainer.dashboard.summary': () => {
          throw trpcError('INTERNAL_SERVER_ERROR', 500);
        },
      }),
    );
    await settle();
    expect(screen.getByTestId('trainer-today-error')).toBeTruthy();
  });
});
