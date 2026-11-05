import { screen } from '@testing-library/react-native';
import type { CoachingStatusDto } from '@chefer/types';
import { newBookingDraft } from '@chefer/utils';
import { ClientBookingScreen } from '../../src/features/coaching/bookings/client-booking-screen';
import { createMemoryKvBackend, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import {
  clientReminderPlan,
  trainerReminderPlan,
} from '../../src/features/notifications/booking-reminders';
import {
  bookingDraftErrorTexts,
  bookingWhenSpokenText,
  bookingWhoText,
  dayLabel,
} from '../../src/features/trainer-mode/bookings/booking-model';
import { getTranslator, resetLocaleForTests } from '../../src/lib/i18n';
import { renderWithTrpc } from './friends-core-harness';
import { bookingClient, clientBooking, trainerBooking, ZONE } from './trainer-bookings-fixtures';
import { settle } from './trainer-fixtures';

// Lane J: bookings in Romanian — the label helpers (dates through `date()`, lowercase weekday
// names), the local reminder text written with `getTranslator()`, and the client's booking screen.

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

const status: CoachingStatusDto = {
  trainer: { name: 'Ana', since: '2026-09-01T09:00:00.000Z' },
  request: null,
  stopped: null,
  consentUpdate: null,
};

beforeEach(() => {
  setKvBackendForTests(createMemoryKvBackend());
  resetLocaleForTests(['ro-RO']);
});
afterAll(() => resetLocaleForTests(['en-US']));

describe('booking labels in Romanian', () => {
  it('writes the weekday through date(), lowercase, and the slot words in Romanian', () => {
    const tr = getTranslator();
    // 2026-10-20 15:00Z is Tuesday 18:00 in Bucharest.
    const b = trainerBooking({ startsAt: '2026-10-20T15:00:00.000Z' });
    expect(bookingWhenSpokenText(tr, b, ZONE)).toBe('marți, 18:00–19:00');
    expect(dayLabel(tr, '2026-10-20', 'weekday-long')).toBe('marți');
    expect(bookingWhoText(tr, { kind: 'BLOCK', clients: [] })).toBe('Blocat');
    expect(
      bookingWhoText(tr, { kind: 'BOOKING', clients: [bookingClient(), bookingClient()] }),
    ).toBe('Maria + 1');
  });

  it('translates the editor’s reasons', () => {
    const draft = newBookingDraft({ date: '2026-10-20', time: '18:00', clients: [] });
    expect(bookingDraftErrorTexts(getTranslator(), draft).clients).toBe(
      'Alege cel puțin un client.',
    );
  });
});

describe('booking reminders in Romanian', () => {
  it('writes the client’s and the trainer’s reminder text in the UI language', () => {
    const now = new Date();
    const start = new Date(now.getTime() + 2 * 3_600_000).toISOString();
    expect(clientReminderPlan([clientBooking({ startsAt: start })], now)[0]?.body).toBe(
      'Ședință cu Ana peste o oră',
    );
    const block = trainerBooking({
      startsAt: start,
      endsAt: new Date(Date.parse(start) + 3_600_000).toISOString(),
      clients: [bookingClient(), bookingClient()],
    });
    expect(trainerReminderPlan([block], now, ZONE)[0]?.body).toMatch(/^\d\d:\d\d Maria \+ 1/);
  });
});

describe('the client’s booking screen in Romanian', () => {
  it('renders the title, the trainer row and the field labels in Romanian', async () => {
    await renderWithTrpc(<ClientBookingScreen bookingId="cb1" />, {
      'coaching.availability': () => ({ enabled: true, canBeTrainer: false }),
      'coaching.status': () => status,
      'coaching.bookings.upcoming': () => [],
      'coaching.bookings.get': () => clientBooking({ otherClients: 2 }),
    });
    await settle();
    expect(screen.getByText('Programarea ta')).toBeTruthy();
    expect(screen.getByTestId('client-booking-trainer')).toHaveTextContent(
      /Antrenorul tău.*Ana, cu încă 2 persoane/,
    );
    expect(screen.getByTestId('client-booking-location')).toHaveTextContent(/Locație/);
  });
});
