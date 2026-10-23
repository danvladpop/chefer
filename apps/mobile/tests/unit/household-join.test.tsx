import { Platform } from 'react-native';
import { onlineManager } from '@tanstack/react-query';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { HOUSEHOLD_SHARING_COPY, type HouseholdInvitePreview } from '@chefer/types';
import { resetSnackbarForTests } from '@chefer/ui-mobile';
import HouseholdJoinRoute from '../../app/household/join/[code]';
import {
  getReturnAfterSignIn,
  getReturnTarget,
  setReturnAfterSignIn,
} from '../../src/features/coaching/pending-join';
import { PendingJoinHost } from '../../src/features/coaching/pending-join-host';
import { KV_KEYS } from '../../src/features/gym/offline/keys';
import { kv } from '../../src/features/gym/offline/kv';
import { safetyEdited } from '../../src/features/household/join/household-consent';
import { householdInviteMessage } from '../../src/features/household/join/household-join-screen';
import { joinPortionPhrase } from '../../src/features/household/sharing/copy';
import { readPendingHouseholdJoin } from '../../src/features/household/sharing/pending-household-join';
import { renderWithTrpc, trpcError } from './friends-core-harness';
import { settle } from './trainer-fixtures';

// ADR 0002 / business_flow §17.1: the household invite's join screen — the shared consent copy, the
// claimed profile's safety terms to confirm or fix, joining, every other invite state, and signed-out
// visitors coming back after sign-in (the generalised PendingJoinHost).

let mockToken: string | null = 'token';
let mockCode = 'HOME234567';
let mockPathname = '/';
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({ code: mockCode }),
  usePathname: () => mockPathname,
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../../src/lib/analytics', () => ({ track: jest.fn() }));
jest.mock('../../src/features/auth/pending-onboarding', () => ({
  usePendingOnboarding: () => false,
}));
jest.mock('../../src/lib/auth-store', () => ({
  ...jest.requireActual<typeof import('../../src/lib/auth-store')>('../../src/lib/auth-store'),
  getToken: () => mockToken,
  subscribe: () => () => undefined,
}));

const { router } = jest.requireMock<{
  router: { push: jest.Mock; replace: jest.Mock; back: jest.Mock };
}>('expo-router');
const { track } = jest.requireMock<{ track: jest.Mock }>('../../src/lib/analytics');

function preview(overrides: Partial<HouseholdInvitePreview> = {}): HouseholdInvitePreview {
  return {
    state: 'OK',
    ownerName: 'Dan',
    profile: {
      name: 'Maria',
      portionFactor: 0.75,
      isKid: false,
      allergies: ['peanuts'],
      dietaryRestrictions: [],
      dislikedIngredients: ['olives'],
    },
    ...overrides,
  };
}

// The first render compiles the screen's module graph; slow CI machines need more than 5 s.
jest.setTimeout(30_000);

const CONSENTED = { name: 'Maria', healthDataConsentAt: '2026-10-01T09:00:00.000Z' };

beforeEach(() => {
  jest.clearAllMocks();
  resetSnackbarForTests();
  onlineManager.setOnline(true);
  jest.replaceProperty(Platform, 'OS', 'android');
  mockToken = 'token';
  mockCode = 'HOME234567';
  mockPathname = '/';
  kv.remove(KV_KEYS.householdPendingJoin);
  setReturnAfterSignIn(null);
});
afterEach(() => jest.restoreAllMocks());

describe('household join: consent screen', () => {
  it('renders the shared copy and the profile it claims', async () => {
    await renderWithTrpc(<HouseholdJoinRoute />, {
      'household.previewInvite': () => preview(),
      'user.me': () => CONSENTED,
    });
    await settle();
    const c = HOUSEHOLD_SHARING_COPY;
    expect(screen.getByText(c.joinTitle('Dan'))).toBeTruthy();
    expect(screen.getByText(c.joinLede('Dan', 'Maria'))).toBeTruthy();
    for (const line of c.joinShares) expect(screen.getByText(line)).toBeTruthy();
    expect(screen.getByText(c.joinPrivate)).toBeTruthy();
    expect(screen.getByText(c.joinSafetyTitle)).toBeTruthy();
    expect(screen.getByText(c.joinPortion('¾'))).toBeTruthy();
    expect(screen.getByText(c.joinOwnPlansNote)).toBeTruthy();
    expect(screen.getByText(c.joinAllow)).toBeTruthy();
    expect(screen.getByText(c.joinDecline)).toBeTruthy();
    // The owner's terms for the profile, prefilled (taxonomy ids shown by label).
    expect(screen.getByTestId('household-join-term-allergies-peanuts')).toBeTruthy();
    expect(screen.getByTestId('household-join-term-dislikedIngredients-olives')).toBeTruthy();
    expect(screen.getByText(c.joinSafetyNone)).toBeTruthy();
    expect(track).toHaveBeenCalledWith('household_invite_opened', { state: 'OK', signedIn: true });
  });

  it('joins with the confirmed (edited) terms, then opens Meals', async () => {
    const user = userEvent.setup();
    const { calls } = await renderWithTrpc(<HouseholdJoinRoute />, {
      'household.previewInvite': () => preview(),
      'user.me': () => CONSENTED,
      'household.join': () => ({ ownerName: 'Dan', profileName: 'Maria' }),
    });
    await settle();
    await user.press(screen.getByTestId('household-join-remove-dislikedIngredients-olives'));
    await user.type(screen.getByTestId('household-join-input-allergies'), 'Sesame');
    await user.press(screen.getByTestId('household-join-add-allergies'));
    await user.press(screen.getByTestId('household-join-allow'));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/meal-plan'));
    expect(calls.find((c) => c.path === 'household.join')?.input).toEqual({
      code: 'HOME234567',
      allergies: ['peanuts', 'Sesame'],
      dietaryRestrictions: [],
      dislikedIngredients: [],
    });
    expect(track).toHaveBeenCalledWith('household_joined', { editedSafety: true });
  });

  it('a failed join shows the server sentence and stays', async () => {
    const user = userEvent.setup();
    await renderWithTrpc(<HouseholdJoinRoute />, {
      'household.previewInvite': () => preview(),
      'user.me': () => CONSENTED,
      'household.join': () => {
        throw trpcError('CONFLICT', 409, {}, HOUSEHOLD_SHARING_COPY.inviteState.PROFILE_TAKEN);
      },
    });
    await settle();
    await user.press(screen.getByTestId('household-join-allow'));
    expect(await screen.findByTestId('household-join-error')).toHaveTextContent(
      HOUSEHOLD_SHARING_COPY.inviteState.PROFILE_TAKEN,
    );
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('Not now forgets the invite and goes back', async () => {
    const user = userEvent.setup();
    kv.setString(KV_KEYS.householdPendingJoin, 'HOME234567');
    await renderWithTrpc(<HouseholdJoinRoute />, {
      'household.previewInvite': () => preview(),
      'user.me': () => CONSENTED,
    });
    await settle();
    await user.press(screen.getByTestId('household-join-decline'));
    expect(router.back).toHaveBeenCalled();
    expect(readPendingHouseholdJoin()).toBeNull();
  });
});

describe('household join: other invite states', () => {
  it.each([
    ['USED', HOUSEHOLD_SHARING_COPY.inviteState.USED],
    ['EXPIRED', HOUSEHOLD_SHARING_COPY.inviteState.EXPIRED],
    ['ALREADY_JOINED', HOUSEHOLD_SHARING_COPY.inviteState.ALREADY_JOINED],
    ['HAS_PARTNERS', HOUSEHOLD_SHARING_COPY.inviteState.HAS_PARTNERS],
  ] as const)('%s shows its one sentence', async (state, sentence) => {
    await renderWithTrpc(<HouseholdJoinRoute />, {
      'household.previewInvite': () => ({ state }),
      'user.me': () => CONSENTED,
    });
    await settle();
    expect(screen.getByTestId('household-invite-message')).toHaveTextContent(sentence);
    expect(screen.queryByTestId('household-join-allow')).toBeNull();
    expect(track).toHaveBeenCalledWith('household_invite_opened', { state, signedIn: true });
  });

  it('IN_OTHER_HOUSEHOLD names the current owner', () => {
    expect(householdInviteMessage({ state: 'IN_OTHER_HOUSEHOLD', currentOwnerName: 'Ana' })).toBe(
      HOUSEHOLD_SHARING_COPY.inviteState.IN_OTHER_HOUSEHOLD('Ana'),
    );
    expect(householdInviteMessage(preview())).toBeNull();
  });

  it('offline is not an answer about the code: Retry', async () => {
    await renderWithTrpc(<HouseholdJoinRoute />, {
      'household.previewInvite': () => {
        throw new TypeError('Network request failed');
      },
      'user.me': () => CONSENTED,
    });
    await settle();
    expect(screen.getByTestId('household-join-error-state')).toBeTruthy();
  });
});

describe('household join: signed out', () => {
  it('keeps the code (on disk and for after sign-in) and offers sign in / register', async () => {
    mockToken = null;
    const user = userEvent.setup();
    await renderWithTrpc(<HouseholdJoinRoute />, {});
    expect(screen.getByTestId('household-join-signed-out')).toBeTruthy();
    expect(readPendingHouseholdJoin()).toBe('HOME234567');
    expect(getReturnTarget()).toEqual({ kind: 'household', code: 'HOME234567' });
    await user.press(screen.getByTestId('household-join-sign-in'));
    expect(router.push).toHaveBeenCalledWith('/login');
  });
});

describe('PendingJoinHost: household invites', () => {
  it('signed in: opens the household invite remembered while signed out, once', async () => {
    setReturnAfterSignIn('HOME234567', 'household');
    kv.setString(KV_KEYS.householdPendingJoin, 'HOME234567');
    const view = await render(<PendingJoinHost signedIn />);
    expect(router.push).toHaveBeenCalledWith('/household/join/HOME234567');
    expect(getReturnAfterSignIn()).toBeNull();
    expect(readPendingHouseholdJoin()).toBeNull();
    await view.rerender(<PendingJoinHost signedIn />);
    expect(router.push).toHaveBeenCalledTimes(1);
  });

  it('after a cold start (only the code on disk): still comes back', async () => {
    kv.setString(KV_KEYS.householdPendingJoin, 'HOME234567');
    await render(<PendingJoinHost signedIn />);
    expect(router.push).toHaveBeenCalledWith('/household/join/HOME234567');
  });

  it('the household invite already on screen: nothing to open', async () => {
    kv.setString(KV_KEYS.householdPendingJoin, 'HOME234567');
    mockPathname = '/household/join/HOME234567';
    await render(<PendingJoinHost signedIn />);
    expect(router.push).not.toHaveBeenCalled();
    expect(readPendingHouseholdJoin()).toBeNull();
  });

  it('a coaching invite still opens the coaching join screen', async () => {
    setReturnAfterSignIn('ABCD234567');
    await render(<PendingJoinHost signedIn />);
    expect(router.push).toHaveBeenCalledWith('/coaching/join/ABCD234567');
  });
});

describe('join helpers', () => {
  it('joinPortionPhrase', () => {
    expect(joinPortionPhrase(1)).toBe('a full portion');
    expect(joinPortionPhrase(0.5)).toBe('½');
    expect(joinPortionPhrase(0.75)).toBe('¾');
    expect(joinPortionPhrase(1.5)).toBe('1½ portions');
  });

  it('safetyEdited ignores order and case', () => {
    const base = {
      allergies: ['Peanuts', 'sesame'],
      dietaryRestrictions: [],
      dislikedIngredients: [],
    };
    expect(safetyEdited(base, { ...base, allergies: ['sesame', 'peanuts'] })).toBe(false);
    expect(safetyEdited(base, { ...base, dislikedIngredients: ['olives'] })).toBe(true);
  });
});
