import { Platform } from 'react-native';
import { onlineManager } from '@tanstack/react-query';
import { act, screen, userEvent } from '@testing-library/react-native';
import { COACHING_COPY } from '@chefer/types';
import { resetSnackbarForTests } from '@chefer/ui-mobile';
import YourTrainerRoute from '../../app/coaching/index';
import { makeQueryClient, renderWithTrpc, trpcError } from './friends-core-harness';
import { settle } from './trainer-fixtures';

// WP-18 lane D: Profile → Your trainer with Leave (spec §2.3 step 5, §2.6).

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

const COACHED = {
  trainer: { name: 'Ana', since: '2026-10-02T09:00:00.000Z' },
  stopped: null,
};
const ON = { 'coaching.availability': () => ({ enabled: true, canBeTrainer: false }) };

beforeEach(() => {
  jest.clearAllMocks();
  resetSnackbarForTests();
  onlineManager.setOnline(true);
  jest.replaceProperty(Platform, 'OS', 'android');
});
afterEach(() => jest.restoreAllMocks());

describe('Your trainer', () => {
  it('shows who, since when, what they see and can do', async () => {
    await renderWithTrpc(<YourTrainerRoute />, { ...ON, 'coaching.status': () => COACHED });
    await settle();
    const c = COACHING_COPY.consent;
    expect(screen.getByTestId('your-trainer-summary')).toHaveTextContent(
      'Coached by Ana since 2 Oct',
    );
    expect(screen.getByText('What Ana sees')).toBeTruthy();
    for (const line of c.willSee) expect(screen.getByText(line)).toBeTruthy();
    expect(screen.getByText('What Ana can do')).toBeTruthy();
    for (const line of c.can('Ana')) expect(screen.getByText(line)).toBeTruthy();
    expect(screen.getByText(c.privateNotes('Ana'))).toBeTruthy();
    expect(screen.getByTestId('your-trainer-leave')).toBeTruthy();
  });

  it('Leave asks first; Cancel leaves nothing, Leave trainer calls coaching.leave and says so', async () => {
    const user = userEvent.setup();
    let left = 0;
    const queryClient = makeQueryClient();
    const statusKey = [['coaching', 'status'], { type: 'query' }];
    const r = await renderWithTrpc(
      <YourTrainerRoute />,
      {
        ...ON,
        'coaching.status': () => (left > 0 ? { trainer: null, stopped: null } : COACHED),
        'coaching.leave': () => {
          left += 1;
          return { trainer: null, stopped: null };
        },
      },
      queryClient,
    );
    await settle();
    await user.press(screen.getByTestId('your-trainer-leave'));
    expect(screen.getByText('Leave Ana?')).toBeTruthy();
    expect(screen.getByText(COACHING_COPY.yourTrainer.leaveBody('Ana'))).toBeTruthy();
    await user.press(screen.getByTestId('your-trainer-leave-confirm-cancel'));
    await settle();
    expect(r.paths()).not.toContain('coaching.leave');

    await user.press(screen.getByTestId('your-trainer-leave'));
    await user.press(screen.getByTestId('your-trainer-leave-confirm-confirm'));
    await settle(6);
    expect(left).toBe(1);
    expect(screen.getByText('You left your trainer')).toBeTruthy();
    // The card now reads "no trainer" (the status was refetched).
    expect(queryClient.getQueryState(statusKey)?.isInvalidated).toBe(false);
    expect(screen.getByTestId('your-trainer-summary')).toHaveTextContent(
      COACHING_COPY.yourTrainer.noTrainer,
    );
    expect(screen.queryByTestId('your-trainer-leave')).toBeNull();
  });

  it('a failed leave keeps the sheet open with the reason', async () => {
    const user = userEvent.setup();
    await renderWithTrpc(<YourTrainerRoute />, {
      ...ON,
      'coaching.status': () => COACHED,
      'coaching.leave': () => {
        throw trpcError('TOO_MANY_REQUESTS', 429, {}, COACHING_COPY.server.tooManyAttempts);
      },
    });
    await settle();
    await user.press(screen.getByTestId('your-trainer-leave'));
    await user.press(screen.getByTestId('your-trainer-leave-confirm-confirm'));
    await settle(6);
    expect(screen.getByText('Leave Ana?')).toBeTruthy();
    expect(screen.getByText(COACHING_COPY.server.tooManyAttempts)).toBeTruthy();
  });

  it('offline: Leave says it needs a connection and sends nothing', async () => {
    const user = userEvent.setup();
    const r = await renderWithTrpc(<YourTrainerRoute />, {
      ...ON,
      'coaching.status': () => COACHED,
      'coaching.leave': () => COACHED,
    });
    await settle();
    await act(() => {
      onlineManager.setOnline(false);
    });
    await user.press(screen.getByTestId('your-trainer-leave'));
    await user.press(screen.getByTestId('your-trainer-leave-confirm-confirm'));
    expect(screen.getByText('Connect to the internet to leave.')).toBeTruthy();
    expect(r.paths()).not.toContain('coaching.leave');
  });

  it('no trainer: the hint, and "Ana stopped coaching you · 2 Oct" after a removal', async () => {
    await renderWithTrpc(<YourTrainerRoute />, {
      ...ON,
      'coaching.status': () => ({
        trainer: null,
        stopped: { trainerName: 'Ana', at: '2026-10-02T09:00:00.000Z' },
      }),
    });
    await settle();
    expect(screen.getByTestId('your-trainer-summary')).toHaveTextContent(
      COACHING_COPY.yourTrainer.noTrainer,
    );
    expect(screen.getByTestId('your-trainer-stopped')).toHaveTextContent(
      'Ana stopped coaching you · 2 Oct',
    );
    expect(screen.getByTestId('your-trainer-hint')).toHaveTextContent(
      COACHING_COPY.yourTrainer.noTrainerHint,
    );
  });

  it('flag off: "isn’t available" and coaching.status is never asked', async () => {
    const r = await renderWithTrpc(<YourTrainerRoute />, {
      'coaching.availability': () => ({ enabled: false, canBeTrainer: false }),
      'coaching.status': () => COACHED,
    });
    await settle();
    expect(screen.getByTestId('your-trainer-unavailable')).toBeTruthy();
    expect(r.paths()).toEqual(['coaching.availability']);
  });
});
