import { onlineManager } from '@tanstack/react-query';
import { createMemoryKvBackend, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import { BookingReminderHost } from '../../src/features/notifications/use-booking-reminders';
import {
  isTrainerModeAvailableCached,
  resetShellModeStoreForTests,
  setShellMode,
  setTrainerModeAvailableCache,
} from '../../src/features/trainer-mode/mode-store';
import { openBookingInMode } from '../../src/features/trainer-mode/open-booking';
import { renderWithTrpc, type Handlers } from './friends-core-harness';
import { bookingIn, clientBooking } from './trainer-bookings-fixtures';
import { settle } from './trainer-fixtures';
import { trainerModeHandlers } from './trainer-mode-fixtures';

// Trainer mode M3 (trainer-mode.md §7.3, §5.1): the root host keeps both sides of the local booking
// reminders in step with the data — the client's upcoming bookings, and the trainer's own while the
// device is in trainer mode — and a tapped reminder opens the booking in the right mode.

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), navigate: jest.fn(), back: jest.fn() },
}));
const mockSync = jest.fn((_role: string, _plan: unknown[]) => Promise.resolve());
jest.mock('../../src/features/notifications/booking-reminders', () => ({
  ...jest.requireActual<object>('../../src/features/notifications/booking-reminders'),
  syncBookingReminders: (role: string, plan: unknown[]) => mockSync(role, plan),
}));

const { router } = jest.requireMock<{ router: { push: jest.Mock; replace: jest.Mock } }>(
  'expo-router',
);

const lastSync = (role: string) =>
  mockSync.mock.calls.filter((c) => c[0] === role).at(-1)?.[1] as
    | { bookingId: string; role: string }[]
    | undefined;

function clientHandlers(extra: Handlers = {}): Handlers {
  return {
    'coaching.availability': () => ({ enabled: true, canBeTrainer: false }),
    'coaching.status': () => ({
      trainer: { name: 'Ana', since: '2026-09-01T00:00:00.000Z' },
      stopped: null,
    }),
    'coaching.bookings.upcoming': () => [
      clientBooking({ id: 'mine', startsAt: new Date(Date.now() + 3 * 3_600_000).toISOString() }),
    ],
    'profile.flags': () => ({}),
    ...extra,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  setKvBackendForTests(createMemoryKvBackend());
  resetShellModeStoreForTests();
  onlineManager.setOnline(true);
});

describe('BookingReminderHost', () => {
  it('a client: schedules their upcoming bookings; the trainer side is cleared', async () => {
    await renderWithTrpc(<BookingReminderHost signedIn />, clientHandlers());
    await settle(6);
    expect(lastSync('client')?.map((p) => p.bookingId)).toEqual(['mine']);
    expect(lastSync('trainer')).toEqual([]);
  });

  it('no trainer: nothing for the client side and no bookings query', async () => {
    const r = await renderWithTrpc(
      <BookingReminderHost signedIn />,
      clientHandlers({
        'coaching.status': () => ({ trainer: null, stopped: null }),
      }),
    );
    await settle(6);
    expect(lastSync('client')).toEqual([]);
    expect(r.paths()).not.toContain('coaching.bookings.upcoming');
  });

  it('a trainer in trainer mode: their own bookings for the next 14 days', async () => {
    setShellMode('trainer');
    const r = await renderWithTrpc(
      <BookingReminderHost signedIn />,
      trainerModeHandlers({
        'coaching.status': () => ({ trainer: null, stopped: null }),
        'trainer.bookings.range': () => ({ bookings: [bookingIn(180, { id: 'tb1' })] }),
      }),
    );
    await settle(8);
    expect(lastSync('trainer')?.map((p) => p.bookingId)).toEqual(['tb1']);
    const range = r.calls.find((c) => c.path === 'trainer.bookings.range')?.input as {
      from: string;
      to: string;
    };
    expect(Date.parse(range.to) - Date.parse(range.from)).toBe(15 * 24 * 3_600_000);
  });

  it('a trainer in personal mode: no trainer reminders', async () => {
    setShellMode('personal');
    const r = await renderWithTrpc(
      <BookingReminderHost signedIn />,
      trainerModeHandlers({ 'coaching.status': () => ({ trainer: null, stopped: null }) }),
    );
    await settle(8);
    expect(lastSync('trainer')).toEqual([]);
    expect(r.paths()).not.toContain('trainer.bookings.range');
  });

  it('signed out: renders nothing and asks nothing', async () => {
    const r = await renderWithTrpc(<BookingReminderHost signedIn={false} />, clientHandlers());
    await settle();
    expect(r.calls).toHaveLength(0);
    expect(mockSync).not.toHaveBeenCalled();
  });
});

describe('a tapped reminder opens the booking in the right mode (§5.1)', () => {
  it('trainer: switches to trainer mode first, then pushes the booking', () => {
    setTrainerModeAvailableCache(true);
    setShellMode('personal');
    openBookingInMode({ role: 'trainer', bookingId: 'b1' });
    expect(router.replace).toHaveBeenCalledWith('/(trainer)/today');
    expect(router.push).toHaveBeenCalledWith('/trainer/bookings/b1');
    expect(router.replace.mock.invocationCallOrder[0]).toBeLessThan(
      router.push.mock.invocationCallOrder[0] ?? 0,
    );
    expect(isTrainerModeAvailableCached()).toBe(true);
  });

  it('client: switches a device in trainer mode back to personal, then opens their booking', () => {
    setTrainerModeAvailableCache(true);
    setShellMode('trainer');
    openBookingInMode({ role: 'client', bookingId: 'cb1' });
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith('/coaching/bookings/cb1');
  });

  it('already in the right mode: just opens the booking', () => {
    setShellMode('personal');
    openBookingInMode({ role: 'client', bookingId: 'cb1' });
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith('/coaching/bookings/cb1');
  });
});
