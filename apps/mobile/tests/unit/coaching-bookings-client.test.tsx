import { Platform } from 'react-native';
import { onlineManager } from '@tanstack/react-query';
import { screen, userEvent } from '@testing-library/react-native';
import type { ClientBookingDto, CoachingNoticeDto, CoachingStatusDto } from '@chefer/types';
import { resetSnackbarForTests } from '@chefer/ui-mobile';
import {
  bookingWhen,
  clientCardText,
  deviceTimeZone,
  nextClientCardBooking,
  todayIn,
} from '@chefer/utils';
import { ClientBookingScreen } from '../../src/features/coaching/bookings/client-booking-screen';
import { CoachingNotices } from '../../src/features/coaching/notices/coaching-notices';
import { LEAVE_HREF } from '../../src/features/coaching/notices/consent-update-notice';
import { YourTrainerScreen } from '../../src/features/coaching/your-trainer/your-trainer-screen';
import { createMemoryKvBackend, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import { renderWithTrpc, trpcError, type Handlers } from './friends-core-harness';
import { clientBooking, ZONE } from './trainer-bookings-fixtures';
import { settle } from './trainer-fixtures';

// Trainer mode M3, the client's side (trainer-mode.md §6.9, §7.1, §10): the upcoming-booking card on
// Today/Train (the next live booking within 7 days, never another client's name), the read-only detail,
// Your trainer's Upcoming bookings, the four booking notices, and the one-time consent v2 notice.

jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't close over imports
  const { useEffect } = require('react') as typeof import('react');
  return {
    router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
    useFocusEffect: (cb: () => void) => {
      useEffect(cb, [cb]);
    },
  };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../../src/features/notifications/booking-reminders', () => ({
  ...jest.requireActual<object>('../../src/features/notifications/booking-reminders'),
  askBookingReminderPermissionOnce: jest.fn(() => Promise.resolve()),
}));

const { router } = jest.requireMock<{ router: { push: jest.Mock } }>('expo-router');
const { askBookingReminderPermissionOnce } = jest.requireMock<{
  askBookingReminderPermissionOnce: jest.Mock;
}>('../../src/features/notifications/booking-reminders');

const DAY = 24 * 3_600_000;
const inDays = (days: number) => new Date(Date.now() + days * DAY).toISOString();

function status(overrides: Partial<CoachingStatusDto> = {}): CoachingStatusDto {
  return {
    trainer: { name: 'Ana', since: '2026-09-01T09:00:00.000Z' },
    request: null,
    stopped: null,
    consentUpdate: null,
    ...overrides,
  };
}

function notice(overrides: Partial<CoachingNoticeDto>): CoachingNoticeDto {
  return {
    id: 'n1',
    kind: 'BOOKING_CREATED',
    at: '2026-10-19T09:00:00.000Z',
    read: false,
    other: { id: 'trainer-ana', name: 'Ana', role: 'TRAINER' },
    ...overrides,
  };
}

function handlers(opts: {
  status?: CoachingStatusDto;
  upcoming?: ClientBookingDto[];
  notices?: CoachingNoticeDto[];
  extra?: Handlers;
}): Handlers {
  return {
    'coaching.availability': () => ({ enabled: true, canBeTrainer: false }),
    'coaching.status': () => opts.status ?? status(),
    'coaching.notices': () => opts.notices ?? [],
    'coaching.bookings.upcoming': () => opts.upcoming ?? [],
    'coaching.dismissNotice': () => ({ ok: true }),
    ...opts.extra,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  setKvBackendForTests(createMemoryKvBackend());
  resetSnackbarForTests();
  onlineManager.setOnline(true);
  jest.replaceProperty(Platform, 'OS', 'android');
});
afterEach(() => jest.restoreAllMocks());

describe('the card’s booking (pure)', () => {
  const now = new Date('2026-10-20T08:00:00.000Z');

  it('is the next live booking starting within 7 days', () => {
    const far = clientBooking({ id: 'far', startsAt: '2026-10-28T08:00:00.000Z' });
    const list = [
      clientBooking({ id: 'gone', startsAt: '2026-10-19T08:00:00.000Z' }), // ended
      clientBooking({ id: 'cancel', startsAt: '2026-10-21T08:00:00.000Z', cancelledAt: 'x' }),
      far,
      clientBooking({ id: 'next', startsAt: '2026-10-22T15:00:00.000Z' }),
    ];
    expect(nextClientCardBooking(list, now)?.id).toBe('next');
    expect(nextClientCardBooking([far], now)).toBeNull(); // 8 days out
  });

  it('never names the other clients: "with 1 other"', () => {
    const b = clientBooking({ startsAt: '2026-10-22T15:00:00.000Z', otherClients: 1 });
    expect(clientCardText(b, ZONE, '2026-10-20')).toBe(
      'Session with Ana · Thu 18:00 · Gym Fit Center · with 1 other',
    );
    expect(clientCardText({ ...b, otherClients: 2, location: null }, ZONE, '2026-10-22')).toBe(
      'Session with Ana · Today 18:00 · with 2 others',
    );
    expect(bookingWhen('2026-10-21T15:00:00.000Z', ZONE)).toBe('Wed 21 Oct, 18:00');
  });
});

describe('Today / Train: card, booking notices and the consent notice', () => {
  it('shows the next booking; a tap opens the read-only detail; reminders are asked for once', async () => {
    const user = userEvent.setup();
    const b = clientBooking({ id: 'cb1', startsAt: inDays(2), otherClients: 1 });
    await renderWithTrpc(<CoachingNotices />, handlers({ upcoming: [b] }));
    await settle();
    expect(screen.getByTestId('coaching-upcoming-booking-text')).toHaveTextContent(
      clientCardText(b, deviceTimeZone(), todayIn(deviceTimeZone())),
    );
    expect(screen.getByTestId('coaching-upcoming-booking-text')).toHaveTextContent(/with 1 other$/);
    expect(askBookingReminderPermissionOnce).toHaveBeenCalledWith('client');
    await user.press(screen.getByTestId('coaching-upcoming-booking'));
    expect(router.push).toHaveBeenCalledWith('/coaching/bookings/cb1');
  });

  it('nothing within 7 days, or no trainer: no card and no booking query without a trainer', async () => {
    const r = await renderWithTrpc(
      <CoachingNotices />,
      handlers({ upcoming: [clientBooking({ startsAt: inDays(9) })] }),
    );
    await settle();
    expect(screen.queryByTestId('coaching-upcoming-booking')).toBeNull();
    await r.unmount();
    const r2 = await renderWithTrpc(
      <CoachingNotices />,
      handlers({ status: status({ trainer: null }) }),
    );
    await settle();
    expect(r2.paths()).not.toContain('coaching.bookings.upcoming');
  });

  it('renders the four booking notices with View', async () => {
    const user = userEvent.setup();
    const at = '2026-10-21T15:00:00.000Z';
    const booking = { bookingId: 'bk1', startsAt: at, timeZone: ZONE, weekly: false, reason: null };
    await renderWithTrpc(
      <CoachingNotices />,
      handlers({
        notices: [
          notice({ id: 'a', kind: 'BOOKING_CREATED', booking: { ...booking, weekly: true } }),
          notice({ id: 'b', kind: 'BOOKING_CHANGED', booking }),
          notice({
            id: 'c',
            kind: 'BOOKING_CANCELLED',
            booking: { ...booking, reason: 'Gym closed' },
          }),
          notice({ id: 'd', kind: 'COACHED_WORKOUT_LOGGED', workoutSessionId: 'ws1' }),
        ],
      }),
    );
    await settle();
    const when = bookingWhen(at, deviceTimeZone());
    expect(screen.getByTestId('coaching-notice-booking_created-title')).toHaveTextContent(
      `Ana booked you for ${when}, every week`,
    );
    expect(screen.getByTestId('coaching-notice-booking_changed-title')).toHaveTextContent(
      `Ana moved your booking to ${when}`,
    );
    expect(screen.getByTestId('coaching-notice-booking_cancelled-title')).toHaveTextContent(
      `Ana cancelled your booking on ${when}`,
    );
    expect(screen.getByTestId('coaching-notice-booking_cancelled-detail')).toHaveTextContent(
      'Gym closed',
    );
    expect(screen.getByTestId('coaching-notice-coached_workout_logged-title')).toHaveTextContent(
      'Ana logged a workout for you',
    );
    await user.press(screen.getByTestId('coaching-notice-booking_changed-view'));
    expect(router.push).toHaveBeenCalledWith('/coaching/bookings/bk1');
    await user.press(screen.getByTestId('coaching-notice-coached_workout_logged-view'));
    expect(router.push).toHaveBeenCalledWith('/gym/session/ws1');
  });

  it('consent v2: a one-time notice; Got it records it, Leave goes to Your trainer', async () => {
    const user = userEvent.setup();
    let acknowledged = 0;
    let current = status({ consentUpdate: { trainerName: 'Ana', version: 2 } });
    await renderWithTrpc(
      <CoachingNotices />,
      handlers({
        extra: {
          'coaching.status': () => current,
          'coaching.acknowledgeConsentUpdate': () => {
            acknowledged += 1;
            current = status();
            return { ok: true };
          },
        },
      }),
    );
    await settle();
    expect(screen.getByTestId('coaching-consent-update-title')).toHaveTextContent(
      'What’s new with Ana: bookings and logged workouts',
    );
    await user.press(screen.getByTestId('coaching-consent-update-leave'));
    expect(router.push).toHaveBeenCalledWith(LEAVE_HREF);
    await user.press(screen.getByTestId('coaching-consent-update-ok'));
    await settle();
    expect(acknowledged).toBe(1);
    expect(screen.queryByTestId('coaching-consent-update')).toBeNull();
  });
});

describe('the booking, read-only', () => {
  it('when, with whom (no names), where, the workout and the trainer’s note', async () => {
    await renderWithTrpc(
      <ClientBookingScreen bookingId="cb1" />,
      handlers({
        extra: { 'coaching.bookings.get': () => clientBooking({ otherClients: 1 }) },
      }),
    );
    await settle();
    expect(screen.getByTestId('client-booking-trainer')).toHaveTextContent(/Ana, with 1 other/);
    expect(screen.getByTestId('client-booking-workout')).toHaveTextContent(/Lower body A/);
    expect(screen.getByTestId('client-booking-location')).toHaveTextContent(/Gym Fit Center/);
    expect(screen.getByTestId('client-booking-note')).toHaveTextContent(/Bring your belt/);
  });

  it('a cancelled booking shows Cancelled and the reason', async () => {
    await renderWithTrpc(
      <ClientBookingScreen bookingId="cb1" />,
      handlers({
        extra: {
          'coaching.bookings.get': () =>
            clientBooking({ cancelledAt: inDays(-1), cancelReason: 'Gym closed' }),
        },
      }),
    );
    await settle();
    expect(screen.getByTestId('client-booking-cancelled')).toBeTruthy();
    expect(screen.getByText('Gym closed')).toBeTruthy();
  });

  it('not theirs: "This booking isn’t available."', async () => {
    await renderWithTrpc(
      <ClientBookingScreen bookingId="x" />,
      handlers({
        extra: {
          'coaching.bookings.get': () => {
            throw trpcError('NOT_FOUND', 404);
          },
        },
      }),
    );
    await settle();
    expect(screen.getByTestId('client-booking-missing')).toBeTruthy();
  });
});

describe('Your trainer', () => {
  it('lists upcoming bookings (cancelled greyed) and shows the consent notice', async () => {
    await renderWithTrpc(
      <YourTrainerScreen />,
      handlers({
        status: status({ consentUpdate: { trainerName: 'Ana', version: 2 } }),
        upcoming: [
          clientBooking({ id: 'u1', startsAt: inDays(1) }),
          clientBooking({ id: 'u2', startsAt: inDays(3), cancelledAt: inDays(-1) }),
        ],
      }),
    );
    await settle();
    expect(screen.getByText('Upcoming bookings')).toBeTruthy();
    expect(screen.getByTestId('client-booking-u1')).toBeTruthy();
    expect(screen.getByTestId('client-booking-u2')).toHaveAccessibleName(/Cancelled/);
    expect(screen.getByTestId('coaching-consent-update')).toBeTruthy();
  });

  it('none: "No bookings coming up."; ?leave=1 opens the Leave confirmation', async () => {
    await renderWithTrpc(<YourTrainerScreen openLeave />, handlers({}));
    await settle();
    expect(screen.getByTestId('your-trainer-bookings-none')).toHaveTextContent(
      'No bookings coming up.',
    );
    expect(screen.getByTestId('your-trainer-leave-confirm-title')).toBeTruthy();
  });

  it('the join consent screen lists the two new lines (copy v2)', () => {
    // Shared copy: the consent screen and Your trainer render COACHING_COPY.consent.can(trainer).
    const { COACHING_COPY } = jest.requireActual<typeof import('@chefer/types')>('@chefer/types');
    const lines = COACHING_COPY.consent.can('Ana');
    expect(lines).toHaveLength(4);
    expect(lines[2]).toMatch(/^Book sessions with you/);
    expect(lines[3]).toBe('Log workouts for you. They go into your history as “Logged by Ana”.');
  });
});
