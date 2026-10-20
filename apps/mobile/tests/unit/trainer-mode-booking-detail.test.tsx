import { Platform } from 'react-native';
import { onlineManager } from '@tanstack/react-query';
import { screen, userEvent } from '@testing-library/react-native';
import type { TrainerBookingDto } from '@chefer/types';
import { resetEntrancesForTests, resetSnackbarForTests } from '@chefer/ui-mobile';
import { deviceTimeZone } from '@chefer/utils';
import { createMemoryKvBackend, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import { BookingDetailScreen } from '../../src/features/trainer-mode/bookings/booking-detail-screen';
import { renderWithTrpc, trpcError, type Handlers } from './friends-core-harness';
import { bookingClient, bookingIn, ION_CLIENT } from './trainer-bookings-fixtures';
import { clientRow, ION, MARIA, settle } from './trainer-fixtures';
import { trainerModeHandlers } from './trainer-mode-fixtures';

// Trainer mode M3 (trainer-mode.md §6.3, §6.4, §6.7): booking detail — the Start window (15 minutes
// before), Attended / No-show per client (and undo), "Logged by you", Edit with the repeat scope, and
// Cancel booking with scope + reason.

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
const { track } = jest.requireMock<{ track: jest.Mock }>('../../src/lib/analytics');

const ZONE = deviceTimeZone();

function detailHandlers(booking: TrainerBookingDto, overrides: Handlers = {}): Handlers {
  return trainerModeHandlers({
    'trainer.bookings.get': () => booking,
    'trainer.bookings.range': () => ({ bookings: [booking] }),
    'trainer.clients.list': () => [clientRow(), clientRow({ clientId: ION, name: 'Ion Rus' })],
    'trainer.templates.list': () => [],
    'trainer.client.routine': () => null,
    ...overrides,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  setKvBackendForTests(createMemoryKvBackend());
  resetSnackbarForTests();
  resetEntrancesForTests();
  onlineManager.setOnline(true);
  jest.replaceProperty(Platform, 'OS', 'android');
});
afterEach(() => jest.restoreAllMocks());

describe('Booking detail', () => {
  it('Start opens 15 minutes before: disabled with the hint 30 minutes before', async () => {
    await renderWithTrpc(
      <BookingDetailScreen bookingId="b1" />,
      detailHandlers(bookingIn(30, { timeZone: ZONE })),
    );
    await settle();
    expect(screen.getByTestId('booking-detail-start')).toBeDisabled();
    expect(screen.getByTestId('booking-detail-start-hint')).toHaveTextContent(
      'Start opens 15 minutes before',
    );
  });

  it('10 minutes before, Start opens the coached logger for this booking', async () => {
    const user = userEvent.setup();
    await renderWithTrpc(
      <BookingDetailScreen bookingId="b1" />,
      detailHandlers(bookingIn(10, { timeZone: ZONE })),
    );
    await settle();
    expect(screen.getByTestId('booking-detail-who')).toHaveTextContent('Maria');
    expect(screen.getByTestId('booking-detail-location')).toHaveTextContent('Gym Fit Center');
    await user.press(screen.getByTestId('booking-detail-start'));
    expect(router.push).toHaveBeenCalledWith('/trainer/coach/b1');
  });

  it('attendance per client: Attended, then tapping it again clears the mark', async () => {
    const user = userEvent.setup();
    let current = bookingIn(-90, { clients: [bookingClient(), ION_CLIENT] });
    const marks: unknown[] = [];
    await renderWithTrpc(
      <BookingDetailScreen bookingId="b1" />,
      detailHandlers(current, {
        'trainer.bookings.get': () => current,
        'trainer.bookings.markAttendance': (input) => {
          const { clientId, attendance } = input as { clientId: string; attendance: 'ATTENDED' };
          marks.push(input);
          current = {
            ...current,
            clients: current.clients.map((c) =>
              c.clientId === clientId ? { ...c, attendance } : c,
            ),
          };
          return current;
        },
      }),
    );
    await settle();
    await user.press(screen.getByTestId(`booking-client-${MARIA}-attended`));
    await settle();
    expect(screen.getByTestId(`booking-client-${MARIA}-attended`)).toBeSelected();
    await user.press(screen.getByTestId(`booking-client-${ION}-no-show`));
    await settle();
    await user.press(screen.getByTestId(`booking-client-${MARIA}-attended`));
    await settle();
    expect(marks).toEqual([
      { bookingId: 'b1', clientId: MARIA, attendance: 'ATTENDED' },
      { bookingId: 'b1', clientId: ION, attendance: 'NO_SHOW' },
      { bookingId: 'b1', clientId: MARIA, attendance: 'SCHEDULED' },
    ]);
    expect(track.mock.calls).toEqual([
      ['attendance_marked', { status: 'ATTENDED' }],
      ['attendance_marked', { status: 'NO_SHOW' }],
    ]);
  });

  it('30 minutes before: no attendance yet, Edit and Cancel still there', async () => {
    await renderWithTrpc(<BookingDetailScreen bookingId="b1" />, detailHandlers(bookingIn(30)));
    await settle();
    expect(screen.queryByTestId(`booking-client-${MARIA}-attended`)).toBeNull();
    expect(screen.getByTestId('booking-detail-edit')).toBeTruthy();
    expect(screen.getByTestId('booking-detail-cancel')).toBeTruthy();
  });

  it('once started: attendance can be marked, Edit and Cancel are gone (the API refuses them)', async () => {
    await renderWithTrpc(<BookingDetailScreen bookingId="b1" />, detailHandlers(bookingIn(-30)));
    await settle();
    expect(screen.getByTestId(`booking-client-${MARIA}-attended`)).toBeTruthy();
    expect(screen.queryByTestId('booking-detail-edit')).toBeNull();
    expect(screen.queryByTestId('booking-detail-cancel')).toBeNull();
  });

  it('a coached workout reads "Logged by you"', async () => {
    await renderWithTrpc(
      <BookingDetailScreen bookingId="b1" />,
      detailHandlers(
        bookingIn(-90, {
          clients: [bookingClient({ attendance: 'ATTENDED', workoutSessionId: 'ws1' })],
        }),
      ),
    );
    await settle();
    expect(screen.getByTestId(`booking-client-${MARIA}-logged`)).toHaveTextContent('Logged by you');
  });

  it('Cancel booking on a repeat: This and following, with the reason clients see', async () => {
    const user = userEvent.setup();
    let cancelled: unknown = null;
    await renderWithTrpc(
      <BookingDetailScreen bookingId="b1" />,
      detailHandlers(bookingIn(120, { seriesId: 's1' }), {
        'trainer.bookings.cancel': (input) => {
          cancelled = input;
          return { ok: true, cancelled: 4 };
        },
      }),
    );
    await settle();
    await user.press(screen.getByTestId('booking-detail-cancel'));
    await user.press(screen.getByTestId('booking-cancel-following'));
    await user.type(screen.getByTestId('booking-cancel-reason'), 'Gym closed');
    await user.press(screen.getByTestId('booking-cancel-confirm'));
    await settle();
    expect(cancelled).toEqual({ bookingId: 'b1', scope: 'FOLLOWING', reason: 'Gym closed' });
    expect(track).toHaveBeenCalledWith('booking_cancelled', { scope: 'FOLLOWING' });
  });

  it('Edit on a repeat asks the scope, then sends only what changed', async () => {
    const user = userEvent.setup();
    let updated: unknown = null;
    const booking = bookingIn(120, { seriesId: 's1', version: 3, timeZone: ZONE });
    await renderWithTrpc(
      <BookingDetailScreen bookingId="b1" />,
      detailHandlers(booking, {
        'trainer.bookings.update': (input) => {
          updated = input;
          return booking;
        },
      }),
    );
    await settle();
    await user.press(screen.getByTestId('booking-detail-edit'));
    await settle();
    expect(screen.getByTestId('booking-editor-title')).toHaveTextContent('Edit booking');
    // Mobile moves bookings in the editor; repeats are not changed there.
    expect(screen.queryByTestId('booking-editor-repeat')).toBeNull();
    await user.press(screen.getByTestId('booking-editor-duration-45'));
    await user.press(screen.getByTestId('booking-editor-save'));
    await user.press(screen.getByTestId('booking-editor-scope-following'));
    await settle();
    expect(updated).toEqual({
      bookingId: 'b1',
      expectedVersion: 3,
      scope: 'FOLLOWING',
      patch: { durationMin: 45 },
    });
  });

  it('a booking that is not the trainer’s says so', async () => {
    await renderWithTrpc(
      <BookingDetailScreen bookingId="nope" />,
      detailHandlers(bookingIn(10), {
        'trainer.bookings.get': () => {
          throw trpcError('NOT_FOUND', 404, {}, 'This booking isn’t available.');
        },
      }),
    );
    await settle();
    expect(screen.getByText('This booking isn’t available.')).toBeTruthy();
  });

  it('offline: Edit and Cancel say a connection is needed', async () => {
    const user = userEvent.setup();
    await renderWithTrpc(<BookingDetailScreen bookingId="b1" />, detailHandlers(bookingIn(120)));
    await settle();
    onlineManager.setOnline(false);
    await user.press(screen.getByTestId('booking-detail-edit'));
    await settle();
    expect(
      screen.getByText('You’re offline. Adding and changing bookings needs a connection.'),
    ).toBeTruthy();
    expect(screen.queryByTestId('booking-editor-title')).toBeNull();
  });
});
