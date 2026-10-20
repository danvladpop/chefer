import { Platform } from 'react-native';
import { onlineManager } from '@tanstack/react-query';
import { screen, userEvent, within } from '@testing-library/react-native';
import type { ClientRowDto } from '@chefer/types';
import { resetEntrancesForTests, resetSnackbarForTests } from '@chefer/ui-mobile';
import TrainerHomeRoute from '../../app/trainer/index';
import { createMemoryKvBackend, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import { ClientsScreen } from '../../src/features/trainer-mode/clients/clients-screen';
import {
  getShellMode,
  resetShellModeStoreForTests,
  setShellMode,
} from '../../src/features/trainer-mode/mode-store';
import { TrainerYouScreen } from '../../src/features/trainer-mode/you/trainer-you-screen';
import { renderWithTrpc } from './friends-core-harness';
import { clientRow, invite, settle, trainerHandlers } from './trainer-fixtures';
import { trainerModeHandlers } from './trainer-mode-fixtures';

// Trainer mode's Clients tab (§6.4) and trainer You (§6.8), plus the legacy /trainer redirect (§5.2).

jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't close over imports
  const { Text } = require('react-native') as typeof import('react-native');
  return {
    router: {
      push: jest.fn(),
      navigate: jest.fn(),
      replace: jest.fn(),
      back: jest.fn(),
      canGoBack: () => true,
    },
    Redirect: ({ href }: { href: string }) => <Text testID="redirect">{href}</Text>,
  };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../../src/lib/analytics', () => ({ track: jest.fn() }));
jest.mock('../../src/lib/sign-out', () => ({ signOut: jest.fn(() => Promise.resolve()) }));

const { router } = jest.requireMock<{ router: { push: jest.Mock; replace: jest.Mock } }>(
  'expo-router',
);

const NAMES = ['Ion', 'Maria', 'Ana', 'Dan', 'Elena', 'Radu', 'Sorin', 'Vlad'];

function clients(count: number): ClientRowDto[] {
  return NAMES.slice(0, count).map((first, i) =>
    clientRow({
      clientId: `client${String(i).padStart(18, '0')}`,
      name: `${first} Pop`,
      label: null,
      // Ion trained last; Ana never did.
      lastWorkoutDate:
        first === 'Ana' ? null : `2026-10-${String(10 + (count - i)).padStart(2, '0')}`,
    }),
  );
}

function names(): string[] {
  return screen
    .getAllByTestId(/^trainer-client-client\d+$/)
    .map((row) => String(row.props.accessibilityLabel).split('.')[0] ?? '');
}

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

describe('Clients tab', () => {
  it('names itself, shows the capacity line and the requests, and sorts by name', async () => {
    await renderWithTrpc(
      <ClientsScreen />,
      trainerModeHandlers({ 'trainer.clients.list': () => clients(3) }),
    );
    await settle();
    expect(screen.getByRole('header', { name: 'Clients' })).toBeTruthy();
    expect(screen.getByTestId('trainer-clients-capacity')).toHaveTextContent('3 of 50 clients');
    expect(names()).toEqual(['Ana Pop', 'Ion Pop', 'Maria Pop']);
    // Under 8 clients there is no search field.
    expect(screen.queryByTestId('trainer-clients-search')).toBeNull();
  });

  it('sorts by last workout, never-trained last', async () => {
    const user = userEvent.setup();
    await renderWithTrpc(
      <ClientsScreen />,
      trainerModeHandlers({ 'trainer.clients.list': () => clients(3) }),
    );
    await settle();
    await user.press(screen.getByTestId('trainer-clients-sort-last-workout'));
    expect(names()).toEqual(['Ion Pop', 'Maria Pop', 'Ana Pop']);
  });

  it('from 8 clients a search field filters the list', async () => {
    const user = userEvent.setup();
    await renderWithTrpc(
      <ClientsScreen />,
      trainerModeHandlers({ 'trainer.clients.list': () => clients(8) }),
    );
    await settle();
    const search = screen.getByTestId('trainer-clients-search');
    expect(search.props.returnKeyType).toBe('search');
    await user.type(search, 'el');
    expect(names()).toEqual(['Elena Pop']);
    await user.clear(search);
    await user.type(search, 'zz');
    expect(screen.getByTestId('trainer-clients-search-empty')).toHaveTextContent(
      'No client matches “zz”.',
    );
  });

  it('Invite a client in the top bar opens the invite flow as a sheet', async () => {
    const user = userEvent.setup();
    const r = await renderWithTrpc(
      <ClientsScreen />,
      trainerModeHandlers({ 'trainer.invites.list': () => [invite()] }),
    );
    await settle();
    // Nothing of the invite flow loads while its sheet is closed.
    expect(r.paths()).not.toContain('trainer.invites.list');
    await user.press(screen.getByTestId('trainer-clients-invite'));
    await settle();
    const sheet = screen.getByTestId('trainer-invite-sheet');
    expect(within(sheet).getByTestId('trainer-invite-create')).toBeTruthy();
    // The QR shows in place inside the sheet (no Modal over a Modal), with Hide.
    await user.press(within(sheet).getByTestId(`trainer-invite-${invite().code}-qr`));
    expect(screen.getByTestId('trainer-invite-qr-inline')).toBeTruthy();
    expect(screen.queryByTestId('trainer-invite-qr-sheet')).toBeNull();
    await user.press(screen.getByTestId('trainer-invite-qr-inline-hide'));
    expect(screen.getByTestId('trainer-invite-create')).toBeTruthy();
  });

  it('no clients yet: the empty state offers the invite', async () => {
    await renderWithTrpc(
      <ClientsScreen />,
      trainerModeHandlers({ 'trainer.clients.list': () => [] }),
    );
    await settle();
    expect(screen.getByTestId('trainer-clients-empty')).toBeTruthy();
    expect(screen.getByTestId('trainer-clients-empty-invite')).toBeTruthy();
  });
});

describe('Trainer You', () => {
  it('starts with "Switch to personal mode", badged with what waits there', async () => {
    const user = userEvent.setup();
    setShellMode('trainer');
    await renderWithTrpc(
      <TrainerYouScreen />,
      trainerModeHandlers({
        'friends.availability': () => ({ enabled: true }),
        'friends.me': () => ({ activated: true, badgeCount: 3 }),
      }),
    );
    await settle();
    const ids = screen.getAllByRole('button').map((b) => b.props.testID as string | undefined);
    expect(ids[0]).toBe('trainer-you-switch-to-personal');
    expect(screen.getByTestId('trainer-you-switch-to-personal')).toHaveAccessibleName(
      'Switch to personal mode, 3 things waiting',
    );
    await user.press(screen.getByTestId('trainer-you-switch-to-personal'));
    expect(getShellMode()).toBe('personal');
    expect(router.replace).toHaveBeenCalledWith('/');
  });

  it('profile, invites, read-only availability, feedback, help and sign out', async () => {
    await renderWithTrpc(
      <TrainerYouScreen />,
      trainerModeHandlers({
        'trainer.status': () => ({
          canActivate: true,
          active: true,
          displayName: 'Ana',
          gymLine: 'Iron Gym',
          activeClients: 50,
        }),
      }),
    );
    await settle();
    expect(screen.getByTestId('trainer-profile')).toBeTruthy();
    expect(screen.getByTestId('trainer-you-invites')).toBeTruthy();
    expect(screen.getByTestId('trainer-you-availability')).toHaveAccessibleName(
      'Availability, Not accepting new clients (50 is the limit)',
    );
    for (const id of ['trainer-you-feedback', 'you-support', 'you-terms', 'you-privacy']) {
      expect(screen.getByTestId(id)).toBeTruthy();
    }
    expect(screen.getByTestId('logout-button')).toBeTruthy();
    expect(screen.getByTestId('build-info')).toHaveTextContent(/^Version/);
  });

  it('turning trainer tools off asks first, then leaves trainer mode', async () => {
    const user = userEvent.setup();
    setShellMode('trainer');
    const r = await renderWithTrpc(
      <TrainerYouScreen />,
      trainerModeHandlers({
        'trainer.status': () => ({
          canActivate: true,
          active: true,
          displayName: 'Ana',
          activeClients: 2,
        }),
        'trainer.deactivate': () => ({ ok: true }),
      }),
    );
    await settle();
    await user.press(screen.getByTestId('trainer-you-turn-off'));
    expect(screen.getByTestId('trainer-you-turn-off-confirm-body')).toHaveTextContent(/2 clients/);
    expect(r.paths()).not.toContain('trainer.deactivate');
    await user.press(screen.getByTestId('trainer-you-turn-off-confirm-confirm'));
    await settle();
    expect(r.paths()).toContain('trainer.deactivate');
    expect(getShellMode()).toBe('personal');
    expect(router.replace).toHaveBeenCalledWith('/');
  });
});

describe('legacy /trainer', () => {
  it('with trainer mode available, goes to the Clients tab', async () => {
    await renderWithTrpc(<TrainerHomeRoute />, trainerModeHandlers());
    await settle();
    expect(screen.getByTestId('redirect')).toHaveTextContent('/(trainer)/clients');
  });

  it('with the flag off, is Trainer tools exactly as before', async () => {
    await renderWithTrpc(<TrainerHomeRoute />, trainerHandlers());
    await settle();
    expect(screen.queryByTestId('redirect')).toBeNull();
    expect(screen.getByTestId('trainer-home')).toBeTruthy();
  });
});
