import { Platform } from 'react-native';
import { onlineManager } from '@tanstack/react-query';
import { screen, userEvent } from '@testing-library/react-native';
import { resetEntrancesForTests, resetSnackbarForTests } from '@chefer/ui-mobile';
import { bookingWhen, deviceTimeZone, newBookingSlot } from '@chefer/utils';
import { createMemoryKvBackend, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import { resetShellModeStoreForTests } from '../../src/features/trainer-mode/mode-store';
import { TrainerTodayScreen } from '../../src/features/trainer-mode/today/trainer-today-screen';
import { renderWithTrpc } from './friends-core-harness';
import { bookingClient, bookingIn, ION_CLIENT } from './trainer-bookings-fixtures';
import { ION, MARIA, settle } from './trainer-fixtures';
import { summary, trainerModeHandlers } from './trainer-mode-fixtures';

// Trainer Today's booking parts (trainer-mode.md §6.1, M3): the next booking with Start from 15
// minutes before (or "No bookings today" + Add a booking), the rest of today, bookings this week,
// past bookings waiting for attendance, sessions delivered this month, and the welcome's Add a booking.

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
jest.mock('../../src/lib/analytics', () => ({ track: jest.fn() }));

const { router } = jest.requireMock<{ router: { push: jest.Mock } }>('expo-router');
const ZONE = deviceTimeZone();

/** A booking later today in the device zone (or tomorrow when the day is almost over). */
const soon = (minutes: number, overrides = {}) =>
  bookingIn(minutes, { timeZone: ZONE, ...overrides });

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

function handlers(overrides: Parameters<typeof summary>[0] = {}) {
  return trainerModeHandlers({
    'trainer.dashboard.summary': () =>
      summary({
        bookingsThisWeek: { scheduled: 5, done: 2 },
        nextBooking: null,
        todayBookings: [],
        unmarkedAttendance: [],
        sessionsDelivered: [],
        ...overrides,
      }),
    'trainer.clients.list': () => [],
    'trainer.templates.list': () => [],
    'trainer.bookings.range': () => ({ bookings: [] }),
  });
}

describe('Trainer Today: bookings (M3)', () => {
  it('the next booking: time, clients, workout, place; Start 10 minutes before opens the logger', async () => {
    const user = userEvent.setup();
    const next = soon(10, { clients: [bookingClient(), ION_CLIENT] });
    await renderWithTrpc(<TrainerTodayScreen />, handlers({ nextBooking: next }));
    await settle();
    const card = screen.getByTestId('trainer-today-next-booking');
    expect(card).toHaveTextContent(/Maria Pop, Ion Rus/);
    expect(card).toHaveTextContent(/Gym Fit Center/);
    await user.press(screen.getByTestId('trainer-today-start'));
    expect(router.push).toHaveBeenCalledWith('/trainer/coach/b1');
    await user.press(screen.getByTestId('trainer-today-next-booking-open'));
    expect(router.push).toHaveBeenCalledWith('/trainer/bookings/b1');
  });

  it('Start waits until 15 minutes before', async () => {
    // 40 minutes ahead; skipped if that crosses midnight (then it is not "today").
    const next = soon(40);
    const sameDay = new Date(next.startsAt).getDate() === new Date().getDate();
    await renderWithTrpc(<TrainerTodayScreen />, handlers({ nextBooking: next }));
    await settle();
    if (sameDay) {
      expect(screen.getByTestId('trainer-today-start')).toBeDisabled();
      expect(screen.getByText('Start opens 15 minutes before')).toBeTruthy();
    } else {
      expect(screen.getByTestId('trainer-today-no-bookings')).toBeTruthy();
    }
  });

  it('nothing today: "No bookings today" and Add a booking opens the editor', async () => {
    const user = userEvent.setup();
    await renderWithTrpc(<TrainerTodayScreen />, handlers());
    await settle();
    expect(screen.getByTestId('trainer-today-no-bookings')).toHaveTextContent('No bookings today');
    await user.press(screen.getByTestId('trainer-today-add-booking'));
    await settle();
    expect(screen.getByTestId('booking-editor-title')).toHaveTextContent('New booking');
  });

  it('the next booking on another day: "No bookings today", a link to it, and Add a booking', async () => {
    const user = userEvent.setup();
    const later = soon(3 * 24 * 60);
    await renderWithTrpc(<TrainerTodayScreen />, handlers({ nextBooking: later }));
    await settle();
    expect(screen.getByTestId('trainer-today-no-bookings')).toHaveTextContent('No bookings today');
    const link = screen.getByTestId('trainer-today-next-booking-open');
    expect(link).toHaveTextContent(`Next booking: ${bookingWhen(later.startsAt, ZONE)} · Maria`);
    expect(screen.queryByTestId('trainer-today-start')).toBeNull();
    await user.press(link);
    expect(router.push).toHaveBeenCalledWith('/trainer/bookings/b1');
    await user.press(screen.getByTestId('trainer-today-add-booking'));
    await settle();
    // A new booking from Today starts at the next full hour (the same rule as web).
    expect(screen.getByTestId('booking-editor-start-value')).toHaveTextContent(
      newBookingSlot(null, new Date(), ZONE).time,
    );
  });

  it('bookings this week count up, done of scheduled', async () => {
    await renderWithTrpc(<TrainerTodayScreen />, handlers());
    await settle();
    expect(screen.getByTestId('trainer-today-stat-bookings')).toHaveAccessibleName(
      'Bookings this week: 2 done · 5 scheduled',
    );
  });

  it('later today, past bookings needing attendance, and sessions delivered', async () => {
    const user = userEvent.setup();
    await renderWithTrpc(
      <TrainerTodayScreen />,
      handlers({
        todayBookings: [soon(180, { id: 'later' })],
        unmarkedAttendance: [soon(-26 * 60, { id: 'old1' }), soon(-50 * 60, { id: 'old2' })],
        sessionsDelivered: [
          { clientId: MARIA, name: 'Maria Pop', count: 6 },
          { clientId: ION, name: 'Ion Rus', count: 2 },
        ],
      }),
    );
    await settle();
    expect(screen.getByTestId('trainer-today-later-later')).toBeTruthy();
    expect(screen.getByTestId('trainer-today-unmarked-title')).toHaveTextContent(
      '2 past bookings need attendance',
    );
    await user.press(screen.getByTestId('trainer-today-unmarked-old1'));
    expect(router.push).toHaveBeenCalledWith('/trainer/bookings/old1');
    expect(screen.getByTestId(`trainer-today-delivered-${MARIA}`)).toHaveAccessibleName(
      'Maria Pop · 6',
    );
    expect(screen.getByText('Counts bookings you marked as attended.')).toBeTruthy();
    await user.press(screen.getByTestId(`trainer-today-delivered-${MARIA}`));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/trainer/[clientId]',
      params: { clientId: MARIA, tab: 'bookings' },
    });
  });

  it('a brand-new trainer’s welcome offers Add a booking', async () => {
    const user = userEvent.setup();
    await renderWithTrpc(
      <TrainerTodayScreen />,
      handlers({ activeClients: 0, quietClients: [], averageAdherence: null }),
    );
    await settle();
    await user.press(screen.getByTestId('trainer-today-welcome-add-booking'));
    await settle();
    expect(screen.getByTestId('booking-editor-title')).toHaveTextContent('New booking');
  });

  it('an older server (no booking fields): no booking parts at all', async () => {
    await renderWithTrpc(
      <TrainerTodayScreen />,
      trainerModeHandlers({ 'trainer.dashboard.summary': () => summary() }),
    );
    await settle();
    expect(screen.queryByTestId('trainer-today-next-booking')).toBeNull();
    expect(screen.queryByTestId('trainer-today-stat-bookings')).toBeNull();
  });
});
