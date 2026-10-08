import type { ReactNode } from 'react';
import { focusManager, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, screen, userEvent, waitFor } from '@testing-library/react-native';
import FoodTabsLayout from '../../app/(food)/_layout';
import MoreScreen from '../../app/(food)/more';
import { FRIENDS_BADGE_POLL_MS, useFriendsMe } from '../../src/features/friends/api/use-friends-me';
import { PrivacySection } from '../../src/features/privacy/privacy-section';
import { SettingsScreen } from '../../src/features/settings/settings-screen';
import { trpc } from '../../src/lib/trpc';
import {
  availableHandlers,
  makeFakeTrpc,
  makeQueryClient,
  meDto,
  OFF_HANDLERS,
  renderWithTrpc,
  trpcError,
  type Handlers,
} from './friends-core-harness';

// F2.0 acceptance: with `friends.availability` off (or failing), NOTHING of
// Following renders and the only friends procedure called is `availability`.
// With it on, More shows `Following` directly under Profile with the badge,
// the Settings hub and the privacy section get their rows, and the More tab
// carries the badge.

const mockTabScreens = new Map<string, Record<string, unknown> | undefined>();

jest.mock('expo-router', () => {
  function MockTabs({ children }: { children: ReactNode }) {
    return children;
  }
  function MockTabScreen({ name, options }: { name: string; options?: Record<string, unknown> }) {
    mockTabScreens.set(name, options);
    return null;
  }
  const Tabs = Object.assign(MockTabs, { Screen: MockTabScreen });
  return {
    router: { push: jest.fn(), back: jest.fn() },
    Tabs,
    Redirect: () => null,
    usePathname: () => '/more',
    useLocalSearchParams: () => ({}),
    useFocusEffect: (effect: () => void) => {
      // Run once on mount, like a first focus.
      const { useEffect } = jest.requireActual<typeof import('react')>('react');
      useEffect(effect, [effect]);
    },
  };
});
jest.mock('../../src/lib/analytics', () => ({ track: jest.fn() }));
jest.mock('../../src/lib/auth-store', () => ({
  clearToken: jest.fn().mockResolvedValue(undefined),
  getToken: () => 'token',
}));
jest.mock('../../src/features/navigation/use-landing', () => ({
  landingSurfaceSync: () => 'food',
  useSyncLandingCache: () => undefined,
}));
jest.mock('../../src/features/feedback/feedback-card', () => ({ FeedbackCard: () => null }));
jest.mock('../../src/features/gym/components/mode-switch', () => ({ ModeSwitch: () => null }));
// The other Privacy & data cards have their own (non-friends) queries.
jest.mock('../../src/features/profile/account-data-card', () => ({ AccountDataCard: () => null }));
jest.mock('../../src/features/profile/ai-consent-card', () => ({ AiConsentCard: () => null }));
jest.mock('../../src/features/profile/analytics-consent-card', () => ({
  AnalyticsConsentCard: () => null,
}));
jest.mock('../../src/features/privacy/health-consent-card', () => ({
  HealthConsentCard: () => null,
}));
jest.mock('../../src/features/privacy/consent-history', () => ({ ConsentHistory: () => null }));

const { router } = jest.requireMock<{ router: { push: jest.Mock } }>('expo-router');
const { track } = jest.requireMock<{ track: jest.Mock }>('../../src/lib/analytics');

/** Let queries settle (availability → me) before asserting. */
async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

const FAILING_HANDLERS: Handlers = {
  'friends.availability': () => {
    throw trpcError('INTERNAL_SERVER_ERROR', 500);
  },
};

beforeEach(() => {
  router.push.mockClear();
  track.mockClear();
  mockTabScreens.clear();
});

const ABSENT_HANDLERS: Handlers = {};

describe.each([
  ['off', OFF_HANDLERS],
  ['failing', FAILING_HANDLERS],
  // An old API without the friends router: availability itself 404s.
  ['absent', ABSENT_HANDLERS],
])('availability %s → nothing renders, only availability is queried', (_label, handlers) => {
  it('More: no Following row, no badge', async () => {
    const r = await renderWithTrpc(<MoreScreen />, handlers);
    await settle();
    expect(screen.getByTestId('more-profile')).toBeTruthy();
    expect(screen.queryByTestId('more-friends')).toBeNull();
    expect(screen.queryByTestId('more-friends-badge')).toBeNull();
    expect(screen.queryByText('Following')).toBeNull();
    expect(r.friendsPaths()).toEqual(['friends.availability']);
  });

  it('Settings hub: no Following row', async () => {
    const r = await renderWithTrpc(<SettingsScreen />, handlers);
    await settle();
    expect(screen.getByTestId('settings-plan-premium')).toBeTruthy();
    expect(screen.queryByTestId('settings-friends')).toBeNull();
    expect(r.friendsPaths()).toEqual(['friends.availability']);
  });

  it('Privacy & data: no Profile visibility row', async () => {
    const r = await renderWithTrpc(<PrivacySection />, handlers);
    await settle();
    expect(screen.getByTestId('profile-gym-settings')).toBeTruthy();
    expect(screen.queryByTestId('profile-friends-visibility')).toBeNull();
    expect(screen.queryByText('Profile visibility')).toBeNull();
    expect(r.friendsPaths()).toEqual(['friends.availability']);
  });

  it('More tab: no badge', async () => {
    const r = await renderWithTrpc(<FoodTabsLayout />, handlers);
    await settle();
    expect(mockTabScreens.get('more')?.tabBarBadge).toBeUndefined();
    expect(r.friendsPaths()).toEqual(['friends.availability']);
  });
});

describe('availability on', () => {
  it('More shows Following directly under Profile, with the badge pill', async () => {
    const r = await renderWithTrpc(<MoreScreen />, availableHandlers(meDto({ badgeCount: 3 })));
    await settle();
    const rows = screen
      .getAllByRole('button')
      .map((b) => b.props.testID as string | undefined)
      .filter((id): id is string => !!id && id.startsWith('more-'));
    expect(rows.indexOf('more-friends')).toBe(rows.indexOf('more-profile') + 1);
    expect(screen.getByTestId('more-friends-badge')).toHaveTextContent('3');
    expect(screen.getByTestId('more-friends').props.accessibilityLabel).toBe('Following, 3 new');
    expect(r.friendsPaths()).toEqual(['friends.availability', 'friends.me']);

    await userEvent.setup().press(screen.getByTestId('more-friends'));
    expect(router.push).toHaveBeenCalledWith('/friends');
    expect(track).toHaveBeenCalledWith('friends_opened', { source: 'more' });
  });

  it('caps the pill at 9+ and hides it at 0', async () => {
    await renderWithTrpc(<MoreScreen />, availableHandlers(meDto({ badgeCount: 14 })));
    await settle();
    expect(screen.getByTestId('more-friends-badge')).toHaveTextContent('9+');
    expect(screen.getByTestId('more-friends').props.accessibilityLabel).toBe('Following, 14 new');
  });

  it('no badge before activation (the row still shows)', async () => {
    await renderWithTrpc(
      <MoreScreen />,
      availableHandlers(meDto({ activated: false, settings: null, badgeCount: 0 })),
    );
    await settle();
    expect(screen.getByTestId('more-friends')).toBeTruthy();
    expect(screen.queryByTestId('more-friends-badge')).toBeNull();
  });

  it('the More tab badge is badgeCount, capped 9+, hidden at 0', async () => {
    await renderWithTrpc(<FoodTabsLayout />, availableHandlers(meDto({ badgeCount: 12 })));
    await settle();
    expect(mockTabScreens.get('more')?.tabBarBadge).toBe('9+');

    await renderWithTrpc(<FoodTabsLayout />, availableHandlers(meDto({ badgeCount: 0 })));
    await settle();
    expect(mockTabScreens.get('more')?.tabBarBadge).toBeUndefined();
  });

  it('Settings hub: Following is the first Account row', async () => {
    await renderWithTrpc(<SettingsScreen />, availableHandlers());
    await settle();
    const ids = screen
      .getAllByRole('button')
      .map((b) => b.props.testID as string | undefined)
      .filter(Boolean);
    expect(ids.indexOf('settings-friends')).toBe(ids.indexOf('settings-plan-premium') - 1);
    await userEvent.setup().press(screen.getByTestId('settings-friends'));
    expect(router.push).toHaveBeenCalledWith('/friends');
    expect(track).toHaveBeenCalledWith('friends_opened', { source: 'settings' });
  });

  it.each([
    ['not activated', meDto({ activated: false, settings: null }), 'Off', '/friends'],
    ['private', meDto(), 'Private', '/friends/settings'],
    [
      'public',
      meDto({
        settings: {
          visibility: 'PUBLIC',
          forcedPrivate: false,
          sharePlan: true,
          shareRecipes: true,
          shareWorkouts: true,
          shareTargets: false,
        },
      }),
      'Public',
      '/friends/settings',
    ],
  ])('Privacy & data: Profile visibility (%s)', async (_label, me, value, href) => {
    await renderWithTrpc(<PrivacySection />, availableHandlers(me));
    await settle();
    expect(screen.getByTestId('profile-friends-visibility-value')).toHaveTextContent(value);
    expect(screen.getByTestId('profile-friends-visibility').props.accessibilityLabel).toBe(
      `Profile visibility, ${value}`,
    );
    await userEvent.setup().press(screen.getByTestId('profile-friends-visibility'));
    expect(router.push).toHaveBeenCalledWith(href);
  });
});

describe('useFriendsMe: the badge poll (the notification mechanism)', () => {
  function wrapperFor(handlers: Handlers) {
    const queryClient = makeQueryClient();
    const fake = makeFakeTrpc(handlers);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <trpc.Provider client={fake.client} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </trpc.Provider>
    );
    return { wrapper, fake };
  }

  afterEach(() => {
    jest.useRealTimers();
    focusManager.setFocused(undefined);
  });

  it('polls friends.me every 60 s in the foreground, and not in the background', async () => {
    jest.useFakeTimers();
    const { wrapper, fake } = wrapperFor(availableHandlers());
    const { result } = await renderHook(() => useFriendsMe(), { wrapper });
    await waitFor(() => expect(result.current.badgeCount).toBe(3));
    const meCalls = () => fake.paths().filter((p) => p === 'friends.me').length;
    expect(meCalls()).toBe(1);

    await act(() => jest.advanceTimersByTimeAsync(FRIENDS_BADGE_POLL_MS));
    await waitFor(() => expect(meCalls()).toBe(2));

    await act(() => focusManager.setFocused(false));
    await act(() => jest.advanceTimersByTimeAsync(FRIENDS_BADGE_POLL_MS * 3));
    expect(meCalls()).toBe(2);

    // Back to the foreground: refetches at once (refetchOnWindowFocus 'always').
    await act(() => focusManager.setFocused(true));
    await waitFor(() => expect(meCalls()).toBe(3));
  });

  it('never calls friends.me while availability is off', async () => {
    jest.useFakeTimers();
    const { wrapper, fake } = wrapperFor(OFF_HANDLERS);
    const { result } = await renderHook(() => useFriendsMe(), { wrapper });
    await waitFor(() => expect(fake.paths()).toContain('friends.availability'));
    await act(() => jest.advanceTimersByTimeAsync(FRIENDS_BADGE_POLL_MS * 3));
    expect(fake.friendsPaths()).toEqual(['friends.availability']);
    expect(result.current).toMatchObject({ available: false, me: undefined, badgeCount: 0 });
  });

  it('re-asks availability when friends.me says the feature was switched off', async () => {
    let enabled = true;
    const { wrapper, fake } = wrapperFor({
      'friends.availability': () => ({ enabled }),
      'friends.me': () => {
        enabled = false;
        throw trpcError('FORBIDDEN', 403, { friendsUnavailable: true });
      },
    });
    const { result } = await renderHook(() => useFriendsMe(), { wrapper });
    await waitFor(() =>
      expect(fake.paths().filter((p) => p === 'friends.availability').length).toBe(2),
    );
    await waitFor(() => expect(result.current.available).toBe(false));
    expect(result.current.badgeCount).toBe(0);
  });
});
