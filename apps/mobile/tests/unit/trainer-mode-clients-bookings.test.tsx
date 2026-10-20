import { Platform } from 'react-native';
import { onlineManager } from '@tanstack/react-query';
import { screen, userEvent } from '@testing-library/react-native';
import type { TrainerClientBookingsDto } from '@chefer/types';
import { resetEntrancesForTests, resetSnackbarForTests } from '@chefer/ui-mobile';
import { createMemoryKvBackend, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import { ClientsScreen } from '../../src/features/trainer-mode/clients/clients-screen';
import { resetShellModeStoreForTests } from '../../src/features/trainer-mode/mode-store';
import { ClientScreen } from '../../src/features/trainer/client/client-screen';
import { renderWithTrpc } from './friends-core-harness';
import { bookingClient, bookingIn } from './trainer-bookings-fixtures';
import { adherence, clientRow, ION, MARIA, settle } from './trainer-fixtures';
import { trainerModeHandlers } from './trainer-mode-fixtures';

// Trainer mode M3 (trainer-mode.md §6.4, §6.5): Clients rows show the next booking and sort by it;
// client detail gains "Add a booking" (the editor with this client ticked) and a Bookings tab.

jest.mock('expo-router', () => ({
  router: {
    push: jest.fn(),
    navigate: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
  },
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../../src/lib/analytics', () => ({ track: jest.fn() }));

const { router } = jest.requireMock<{ router: { push: jest.Mock } }>('expo-router');
const ANA = 'cana0000000000000000000003';

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

describe('Clients: next booking', () => {
  const rows = [
    clientRow({ clientId: MARIA, name: 'Maria Pop', nextBookingAt: null }),
    clientRow({ clientId: ION, name: 'Ion Rus', nextBookingAt: bookingIn(48 * 60).startsAt }),
    clientRow({ clientId: ANA, name: 'Ana Dan', nextBookingAt: bookingIn(24 * 60).startsAt }),
  ];

  it('a row says when the next booking is; "Next booking" sorts soonest first, none last', async () => {
    const user = userEvent.setup();
    await renderWithTrpc(
      <ClientsScreen />,
      trainerModeHandlers({ 'trainer.clients.list': () => rows }),
    );
    await settle();
    expect(screen.getByTestId(`trainer-client-${ION}-next-booking`)).toHaveTextContent(
      /^Next booking: \w{3} \d{1,2} \w{3}, \d{2}:\d{2}$/,
    );
    expect(screen.queryByTestId(`trainer-client-${MARIA}-next-booking`)).toBeNull();
    await user.press(screen.getByTestId('trainer-clients-sort-next-booking'));
    const order = screen
      .getAllByTestId(/^trainer-client-c\w+$/)
      .map((n) => (n.props as { testID: string }).testID);
    expect(order).toEqual([
      `trainer-client-${ANA}`,
      `trainer-client-${ION}`,
      `trainer-client-${MARIA}`,
    ]);
  });
});

describe('Client detail (trainer mode M3)', () => {
  const bookings: TrainerClientBookingsDto = {
    upcoming: [bookingIn(24 * 60, { id: 'up1' })],
    past: [
      bookingIn(-48 * 60, { id: 'p1', clients: [bookingClient({ attendance: 'ATTENDED' })] }),
      bookingIn(-24 * 60, { id: 'p2' }),
    ],
    deliveredThisMonth: 6,
    deliveredLastMonth: 4,
  };
  const handlers = trainerModeHandlers({
    'trainer.client.overview': () => ({
      client: { id: MARIA, name: 'Maria Pop', keepItSimple: false },
      adherence: adherence(),
    }),
    'trainer.client.workouts': () => ({ items: [], nextCursor: null }),
    'trainer.client.bookings': () => bookings,
    'trainer.client.routine': () => null,
    'trainer.templates.list': () => [],
    'trainer.bookings.range': () => ({ bookings: [] }),
  });

  it('the Bookings tab: delivered this month / last month, upcoming and past with attendance', async () => {
    const user = userEvent.setup();
    const r = await renderWithTrpc(
      <ClientScreen clientId={MARIA} initialTab="bookings" />,
      handlers,
    );
    await settle();
    const input = r.calls.find((c) => c.path === 'trainer.client.bookings')?.input as {
      clientId: string;
      today: string;
    };
    expect(input.clientId).toBe(MARIA);
    expect(input.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(screen.getByTestId('trainer-client-delivered')).toHaveTextContent(
      '6 delivered this month · 4 last month',
    );
    expect(screen.getByTestId('trainer-client-booking-p1')).toHaveAccessibleName(/Attended$/);
    expect(screen.getByTestId('trainer-client-booking-p2')).toHaveAccessibleName(
      /Mark attendance$/,
    );
    await user.press(screen.getByTestId('trainer-client-booking-up1'));
    expect(router.push).toHaveBeenCalledWith('/trainer/bookings/up1');
  });

  it('Add a booking opens the editor with this client ticked', async () => {
    const user = userEvent.setup();
    await renderWithTrpc(<ClientScreen clientId={MARIA} />, handlers);
    await settle();
    await user.press(screen.getByTestId('trainer-client-add-booking'));
    await settle();
    expect(screen.getByTestId('booking-editor-title')).toHaveTextContent('New booking');
    expect(screen.getByTestId(`booking-editor-client-${MARIA}`)).toBeChecked();
  });
});
