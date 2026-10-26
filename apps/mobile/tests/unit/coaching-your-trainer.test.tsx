import { Platform } from 'react-native';
import { onlineManager } from '@tanstack/react-query';
import { act, fireEvent, screen, userEvent } from '@testing-library/react-native';
import { COACHING_COPY, COACHING_SHARING_COPY } from '@chefer/types';
import { resetSnackbarForTests } from '@chefer/ui-mobile';
import YourTrainerRoute from '../../app/coaching/index';
import { makeQueryClient, renderWithTrpc, trpcError } from './friends-core-harness';
import { settle } from './trainer-fixtures';

// WP-18 lane D: Profile → Your trainer with Leave (spec §2.3 step 5, §2.6).

// `useFocusEffect` runs on mount; `refocus()` runs the latest callback again, as returning to the screen does.
const focus: { run: (() => void) | null } = { run: null };
const refocus = () => focus.run?.();
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react');
  return {
    router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
    useLocalSearchParams: () => ({}),
    useFocusEffect: (cb: () => void) => {
      focus.run = cb;
      useEffect(cb, [cb]);
    },
  };
});
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
  it('coming back to the screen re-reads the status: an accepted request is not shown as still waiting', async () => {
    let accepted = false;
    const pending = {
      trainer: null,
      request: {
        id: 'r1',
        trainer: { id: 't1', name: 'Ana' },
        createdAt: '2026-10-17T09:00:00.000Z',
        expiresAt: '2026-10-31T09:00:00.000Z',
      },
      stopped: null,
    };
    await renderWithTrpc(<YourTrainerRoute />, {
      ...ON,
      'coaching.status': () => (accepted ? { ...COACHED, request: null } : pending),
    });
    await settle();
    expect(screen.getByText(COACHING_COPY.request.pending('Ana'))).toBeTruthy();
    accepted = true; // Ana accepted on her phone.
    await act(() => {
      refocus();
      return Promise.resolve();
    });
    await settle();
    expect(screen.getByTestId('your-trainer-summary')).toHaveTextContent(
      'Coached by Ana since 2 Oct',
    );
  });

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

// ─── Lane K1: "What you share with Ana" ───────────────────────────────────────

/** RN's Switch carries `value` on iOS and `on` on Android (this file renders as Android). */
const isOn = (el: { props: { value?: unknown; on?: unknown } }) => el.props.value ?? el.props.on;
const coachedSharing = (food: boolean, weight: boolean) => ({
  ...COACHED,
  trainer: {
    ...COACHED.trainer,
    sharing: {
      food,
      weight,
      foodSince: food ? '2026-10-02T09:00:00.000Z' : null,
      weightSince: weight ? '2026-10-02T09:00:00.000Z' : null,
    },
  },
});

describe('Your trainer → What you share', () => {
  it('shows the current switches and revokes one with a confirmation snackbar', async () => {
    const calls: unknown[] = [];
    await renderWithTrpc(<YourTrainerRoute />, {
      ...ON,
      'coaching.status': () => coachedSharing(true, false),
      'coaching.setSharing': (input) => {
        calls.push(input);
        return coachedSharing(false, false).trainer.sharing;
      },
    });
    await screen.findByTestId('your-trainer-share-food');
    expect(screen.getByText(COACHING_SHARING_COPY.settingsHeading('Ana'))).toBeTruthy();
    expect(isOn(screen.getByTestId('your-trainer-share-food'))).toBe(true);
    await fireEvent(screen.getByTestId('your-trainer-share-food'), 'valueChange', false);
    await settle();
    expect(calls).toEqual([{ food: false }]);
    expect(isOn(screen.getByTestId('your-trainer-share-food'))).toBe(false);
    expect(screen.getByText(COACHING_SHARING_COPY.food.off('Ana'))).toBeTruthy();
  });

  it('a failed save rolls the switch back', async () => {
    await renderWithTrpc(<YourTrainerRoute />, {
      ...ON,
      'coaching.status': () => coachedSharing(false, false),
      'coaching.setSharing': () => {
        throw trpcError('BAD_REQUEST', 400);
      },
    });
    await settle();
    await fireEvent(screen.getByTestId('your-trainer-share-weight'), 'valueChange', true);
    await settle();
    expect(isOn(screen.getByTestId('your-trainer-share-weight'))).toBe(false);
    expect(screen.getByTestId('your-trainer-sharing-error')).toBeTruthy();
  });
});
