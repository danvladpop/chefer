import { act, render, screen } from '@testing-library/react-native';
import FoodTabsLayout from '../../app/(food)/_layout';
import {
  clearPendingOnboarding,
  requestOnboarding,
} from '../../src/features/auth/pending-onboarding';

// R-18b: a just-registered account must reach onboarding on EVERY first run.
// The decision is state read by the first protected screen the sign-in guard
// flip mounts (the Food tab layout), not an imperative navigation racing the
// token writes. A leftover Gym mode must not swallow it.

jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't close over top-of-file imports
  const { Text, View } = require('react-native') as typeof import('react-native');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createElement } = require('react') as typeof import('react');
  function MockTabs({ children }: { children: React.ReactNode }) {
    return createElement(View, { testID: 'tabs' }, createElement(Text, null, 'tabs'), children);
  }
  const Tabs = Object.assign(MockTabs, { Screen: () => null });
  return {
    Tabs,
    Redirect: ({ href }: { href: string }) => createElement(Text, { testID: 'redirect' }, href),
    usePathname: () => '/',
  };
});
jest.mock('../../src/features/friends/api/use-friends-me', () => ({
  useFriendsMe: () => ({ badgeCount: 0 }),
}));
jest.mock('../../src/lib/auth-store', () => ({ getToken: () => 'token-gym-user' }));
let mockLanding: 'food' | 'gym' = 'food';
jest.mock('../../src/features/navigation/use-landing', () => ({
  landingSurfaceSync: () => mockLanding,
  useSyncLandingCache: () => undefined,
}));

beforeEach(() => {
  clearPendingOnboarding();
  mockLanding = 'food';
});

describe('Food tab layout — post-registration onboarding redirect', () => {
  it('redirects to /onboarding while a registration is pending', async () => {
    requestOnboarding();
    await render(<FoodTabsLayout />);
    expect(screen.getByTestId('redirect').props.children).toBe('/onboarding');
    expect(screen.queryByTestId('tabs')).toBeNull();
  });

  it('wins over a Gym landing left over from the previous account', async () => {
    mockLanding = 'gym';
    requestOnboarding();
    await render(<FoodTabsLayout />);
    expect(screen.getByTestId('redirect').props.children).toBe('/onboarding');
  });

  it('renders the tabs again once onboarding has been reached', async () => {
    requestOnboarding();
    await render(<FoodTabsLayout />);
    await act(() => {
      clearPendingOnboarding();
    });
    expect(screen.getByTestId('tabs')).toBeTruthy();
  });

  it('does not redirect a plain sign-in', async () => {
    await render(<FoodTabsLayout />);
    expect(screen.queryByTestId('redirect')).toBeNull();
    expect(screen.getByTestId('tabs')).toBeTruthy();
  });
});
