import { Platform } from 'react-native';
import { onlineManager } from '@tanstack/react-query';
import { fireEvent, screen, userEvent, within } from '@testing-library/react-native';
import type { ClientRowDto, CreateBookingInput, TrainerBookingDto } from '@chefer/types';
import { resetEntrancesForTests, resetSnackbarForTests } from '@chefer/ui-mobile';
import {
  addDaysLocal,
  bookingWeekRange,
  deviceTimeZone,
  todayIn,
  weekStartOf,
  zonedToUtc,
} from '@chefer/utils';
import { createMemoryKvBackend, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import { BookingEditorSheet } from '../../src/features/trainer-mode/bookings/booking-editor';
import { HOUR_PT } from '../../src/features/trainer-mode/bookings/schedule-grid';
import { ScheduleScreen } from '../../src/features/trainer-mode/bookings/schedule-screen';
import { resetShellModeStoreForTests } from '../../src/features/trainer-mode/mode-store';
import { renderWithTrpc, type Handlers } from './friends-core-harness';
import { ION_CLIENT, trainerBooking } from './trainer-bookings-fixtures';
import { clientRow, ION, MARIA, settle } from './trainer-fixtures';
import { trainerModeHandlers } from './trainer-mode-fixtures';

// Trainer mode M3 (docs/prd-2026-10/trainer-mode.md §6.2, §6.3): Schedule (Day / Week, one range per
// week, blocks as labelled buttons, + and long-press to create) and the booking editor's payloads
// (repeat, blocked time, the 6-client cap, the overlap warning, offline).

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
jest.mock('../../src/features/notifications/booking-reminders', () => ({
  ...jest.requireActual<object>('../../src/features/notifications/booking-reminders'),
  askBookingReminderPermissionOnce: jest.fn(() => Promise.resolve()),
}));

const { router } = jest.requireMock<{ router: { push: jest.Mock } }>('expo-router');
const { track } = jest.requireMock<{ track: jest.Mock }>('../../src/lib/analytics');
const { askBookingReminderPermissionOnce } = jest.requireMock<{
  askBookingReminderPermissionOnce: jest.Mock;
}>('../../src/features/notifications/booking-reminders');

const ZONE = deviceTimeZone();
const TODAY = todayIn(ZONE);
/** An instant at `time` today in the device zone (the zone these screens lay out in). */
const todayAt = (time: string, date = TODAY) => zonedToUtc(date, time, ZONE).toISOString();

const MARIA_18 = trainerBooking({ id: 'b-maria', startsAt: todayAt('18:00'), timeZone: ZONE });
const ION_18 = trainerBooking({
  id: 'b-ion',
  startsAt: todayAt('18:00'),
  timeZone: ZONE,
  clients: [ION_CLIENT],
});
const LUNCH = trainerBooking({
  id: 'b-block',
  kind: 'BLOCK',
  clients: [],
  startsAt: todayAt('12:00'),
  timeZone: ZONE,
});

function scheduleHandlers(bookings: TrainerBookingDto[], overrides: Handlers = {}): Handlers {
  return trainerModeHandlers({
    'trainer.status': () => ({
      canActivate: true,
      active: true,
      displayName: 'Ana',
      gymLine: 'Gym Fit Center',
    }),
    'trainer.bookings.range': () => ({ bookings }),
    'trainer.clients.list': () => [
      clientRow(),
      clientRow({ clientId: ION, name: 'Ion Rus', label: null }),
    ],
    'trainer.templates.list': () => [],
    'trainer.client.routine': () => null,
    ...overrides,
  });
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

describe('Schedule', () => {
  it('asks one range for the visible week and draws each booking as a labelled button', async () => {
    const user = userEvent.setup();
    const r = await renderWithTrpc(<ScheduleScreen />, scheduleHandlers([MARIA_18, ION_18, LUNCH]));
    await settle();
    const ranges = r.calls.filter((c) => c.path === 'trainer.bookings.range');
    expect(ranges).toHaveLength(1);
    expect(ranges[0]?.input).toEqual(bookingWeekRange(weekStartOf(TODAY), ZONE));

    const maria = screen.getByTestId('schedule-block-b-maria');
    expect(maria).toHaveAccessibleName(/^\w+day 18:00 to 19:00, Maria, Lower body A$/);
    expect(screen.getByTestId('schedule-block-b-ion')).toHaveAccessibleName(
      /^\w+day 18:00 to 19:00, Ion$/,
    );
    expect(screen.getByTestId('schedule-block-b-block')).toHaveAccessibleName(
      /^\w+day 12:00 to 13:00, Blocked$/,
    );
    await user.press(maria);
    expect(router.push).toHaveBeenCalledWith('/trainer/bookings/b-maria');
  });

  it('moving between days of the week makes no new round trip; the next week asks again', async () => {
    const user = userEvent.setup();
    const r = await renderWithTrpc(<ScheduleScreen />, scheduleHandlers([]));
    await settle();
    expect(screen.getByTestId('schedule-empty')).toHaveTextContent('Nothing booked');
    const other = addDaysLocal(weekStartOf(TODAY), TODAY === weekStartOf(TODAY) ? 1 : 0);
    await user.press(screen.getByTestId(`schedule-days-${other}`));
    await settle();
    expect(r.calls.filter((c) => c.path === 'trainer.bookings.range')).toHaveLength(1);
    await user.press(screen.getByTestId('schedule-next-week'));
    await settle();
    expect(r.calls.filter((c) => c.path === 'trainer.bookings.range')).toHaveLength(2);
  });

  it('Week view: seven columns; a day header opens that day', async () => {
    const user = userEvent.setup();
    await renderWithTrpc(<ScheduleScreen />, scheduleHandlers([MARIA_18]));
    await settle();
    await user.press(screen.getByTestId('schedule-view-week'));
    const monday = weekStartOf(TODAY);
    for (let i = 0; i < 7; i += 1) {
      expect(screen.getByTestId(`schedule-column-${addDaysLocal(monday, i)}`)).toBeTruthy();
    }
    expect(screen.getByTestId('schedule-block-b-maria')).toBeTruthy();
    await user.press(screen.getByTestId(`schedule-week-day-${TODAY}`));
    expect(screen.getByTestId('schedule-days')).toBeTruthy();
  });

  it('+ opens the editor on the next full hour with the gym line; a booking is created', async () => {
    const user = userEvent.setup();
    let created: CreateBookingInput | null = null;
    const r = await renderWithTrpc(
      <ScheduleScreen />,
      scheduleHandlers([], {
        'trainer.bookings.create': (input) => {
          created = input as CreateBookingInput;
          return trainerBooking({ id: 'new' });
        },
      }),
    );
    await settle();
    await user.press(screen.getByTestId('schedule-add'));
    await settle();
    expect(screen.getByTestId('booking-editor-title')).toHaveTextContent('New booking');
    expect(screen.getByTestId('booking-editor-location')).toHaveDisplayValue('Gym Fit Center');
    await user.press(screen.getByTestId(`booking-editor-client-${MARIA}`));
    await user.press(screen.getByTestId(`booking-editor-client-${ION}`));
    await user.press(screen.getByTestId('booking-editor-save'));
    await settle();
    expect(created).toMatchObject({
      kind: 'BOOKING',
      date: TODAY,
      timeZone: ZONE,
      durationMin: 60,
      clients: [{ clientId: MARIA }, { clientId: ION }],
      location: 'Gym Fit Center',
      repeat: null,
    });
    expect(track).toHaveBeenCalledWith('booking_created', { repeat: false, clients: 2 });
    expect(askBookingReminderPermissionOnce).toHaveBeenCalledWith('trainer');
    // The calendar is asked again after the change.
    expect(r.calls.filter((c) => c.path === 'trainer.bookings.range').length).toBeGreaterThan(1);
  });

  it('a long-press on an empty slot opens the editor at that time, with the overlap warning', async () => {
    await renderWithTrpc(<ScheduleScreen />, scheduleHandlers([MARIA_18]));
    await settle();
    await fireEvent(screen.getByTestId(`schedule-column-${TODAY}`), 'longPress', {
      nativeEvent: { locationY: 18.5 * HOUR_PT },
    });
    await settle();
    expect(screen.getByTestId('booking-editor-start-value')).toHaveTextContent('18:30');
    expect(screen.getByTestId('booking-editor-overlap')).toHaveTextContent(
      'Overlaps with 18:00 Maria',
    );
    // Saving is still allowed.
    expect(screen.getByTestId('booking-editor-save')).not.toBeDisabled();
    await settle();
  });

  it('offline: + says a connection is needed and opens nothing', async () => {
    const user = userEvent.setup();
    await renderWithTrpc(<ScheduleScreen />, scheduleHandlers([]));
    await settle();
    onlineManager.setOnline(false);
    await user.press(screen.getByTestId('schedule-add'));
    await settle();
    expect(
      screen.getByText('You’re offline. Adding and changing bookings needs a connection.'),
    ).toBeTruthy();
    expect(screen.queryByTestId('booking-editor-title')).toBeNull();
  });
});

describe('Booking editor', () => {
  function renderEditor(handlers: Handlers, clients?: ClientRowDto[]) {
    return renderWithTrpc(
      <BookingEditorSheet
        visible
        onClose={jest.fn()}
        target={{ kind: 'new', prefill: { date: addDaysLocal(TODAY, 1), time: '07:00' } }}
      />,
      scheduleHandlers([], {
        ...(clients ? { 'trainer.clients.list': () => clients } : {}),
        ...handlers,
      }),
    );
  }

  it('needs a client for a booking; blocked time hides clients and sends none', async () => {
    const user = userEvent.setup();
    let created: CreateBookingInput | null = null;
    await renderEditor({
      'trainer.bookings.create': (input) => {
        created = input as CreateBookingInput;
        return trainerBooking({ id: 'blk', kind: 'BLOCK', clients: [] });
      },
    });
    await settle();
    await user.press(screen.getByTestId('booking-editor-save'));
    expect(screen.getByTestId('booking-editor-needs-client')).toHaveTextContent(
      'Pick at least one client.',
    );
    expect(created).toBeNull();
    await user.press(screen.getByTestId('booking-editor-type-block'));
    expect(screen.queryByTestId('booking-editor-clients')).toBeNull();
    await user.press(screen.getByTestId('booking-editor-save'));
    await settle();
    expect(created).toMatchObject({ kind: 'BLOCK', clients: [], time: '07:00' });
    expect(track).not.toHaveBeenCalledWith('booking_created', expect.anything());
  });

  it('every week, until a chosen date, with 45 minutes', async () => {
    const user = userEvent.setup();
    let created: CreateBookingInput | null = null;
    await renderEditor({
      'trainer.bookings.create': (input) => {
        created = input as CreateBookingInput;
        return trainerBooking();
      },
    });
    await settle();
    await user.press(screen.getByTestId(`booking-editor-client-${MARIA}`));
    await user.press(screen.getByTestId('booking-editor-duration-45'));
    await user.press(screen.getByTestId('booking-editor-repeat-weekly'));
    await user.press(screen.getByTestId('booking-editor-repeat-until'));
    await user.press(screen.getByTestId('booking-editor-until-next'));
    await user.press(screen.getByTestId('booking-editor-save'));
    await settle();
    const first = addDaysLocal(TODAY, 1);
    expect(created).toMatchObject({
      durationMin: 45,
      repeat: { rule: 'WEEKLY', until: addDaysLocal(first, 7 * 12) },
    });
    expect(track).toHaveBeenCalledWith('booking_created', { repeat: true, clients: 1 });
  });

  it('at most 6 clients: the rest are disabled once 6 are ticked', async () => {
    const user = userEvent.setup();
    const ids = Array.from({ length: 7 }, (_, i) => `client${String(i).padStart(18, '0')}`);
    const seven = ids.map((clientId, i) => clientRow({ clientId, name: `Client ${i}` }));
    await renderEditor({}, seven);
    await settle();
    for (let i = 0; i < 6; i += 1) {
      await user.press(screen.getByTestId(`booking-editor-client-${ids[i] ?? ''}`));
    }
    expect(screen.getByTestId(`booking-editor-client-${ids[6] ?? ''}`)).toBeDisabled();
    expect(screen.getByTestId(`booking-editor-client-${ids[0] ?? ''}`)).not.toBeDisabled();
  });

  it('5-minute start steps', async () => {
    const user = userEvent.setup();
    await renderEditor({});
    await settle();
    await user.press(screen.getByTestId('booking-editor-start'));
    await user.press(screen.getByTestId('booking-editor-start-hour-17'));
    await user.press(screen.getByTestId('booking-editor-start-minute-35'));
    expect(screen.getByTestId('booking-editor-start-value')).toHaveTextContent('17:35');
  });

  it('a template or a routine day per client', async () => {
    const user = userEvent.setup();
    let created: CreateBookingInput | null = null;
    await renderEditor({
      'trainer.templates.list': () => [
        {
          id: 'tpl1',
          name: 'Lower body A',
          workoutType: null,
          exerciseCount: 4,
          estimatedMin: 40,
          assignedCount: 0,
          outdatedCount: 0,
          updatedAt: '2026-10-01T00:00:00.000Z',
        },
      ],
      'trainer.bookings.create': (input) => {
        created = input as CreateBookingInput;
        return trainerBooking();
      },
    });
    await settle();
    await user.press(screen.getByTestId(`booking-editor-client-${MARIA}`));
    await settle();
    const picker = screen.getByTestId(`booking-editor-workout-${MARIA}`);
    expect(within(picker).getByText('Their next routine day')).toBeTruthy();
    await user.press(picker);
    await user.press(screen.getByTestId(`booking-editor-workout-${MARIA}-tpl:tpl1`));
    await user.press(screen.getByTestId('booking-editor-save'));
    await settle();
    expect(created).toMatchObject({
      clients: [{ clientId: MARIA, workout: { kind: 'TEMPLATE', templateId: 'tpl1' } }],
    });
  });
});
