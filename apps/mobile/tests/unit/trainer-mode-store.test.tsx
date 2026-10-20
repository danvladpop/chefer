import { AccessibilityInfo } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import FoodTabsLayout from '../../app/(food)/_layout';
import { clearLocalUserData } from '../../src/features/gym/offline/clear-local-data';
import { createMemoryKvBackend, kv, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import { relandTarget } from '../../src/features/navigation/foreground-landing';
import { resetLandingGateForTests } from '../../src/features/navigation/landing-gate';
import { trainerModePathFor } from '../../src/features/shell/shell-routes';
import { resetShellStoreForTests, setShellV2Preview } from '../../src/features/shell/shell-store';
import {
  getShellMode,
  isTrainerModeAvailableCached,
  landingShellModeSync,
  resetShellModeStoreForTests,
  setShellMode,
  setTrainerModeAvailableCache,
} from '../../src/features/trainer-mode/mode-store';
import { personalHomeHref, switchShellMode } from '../../src/features/trainer-mode/switch-mode';

// Trainer mode (docs/prd-2026-10/trainer-mode.md §5.1): the per-device mode, the cached "available"
// answer, the cold-start landing, the foreground re-landing and the switch action.

jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't close over imports
  const { Text, View } = require('react-native') as typeof import('react-native');
  function Tabs({ children }: { children: React.ReactNode }) {
    return <View testID="tabs">{children}</View>;
  }
  Tabs.Screen = function TabsScreen() {
    return null;
  };
  return {
    Tabs,
    Redirect: ({ href }: { href: unknown }) => (
      <Text testID="redirect">{typeof href === 'string' ? href : JSON.stringify(href)}</Text>
    ),
    usePathname: () => '/',
    useGlobalSearchParams: () => ({}),
    router: { replace: jest.fn() },
  };
});
jest.mock('../../src/features/friends/api/use-friends-me', () => ({
  useFriendsMe: () => ({ badgeCount: 0 }),
}));
jest.mock('../../src/features/auth/pending-onboarding', () => ({
  usePendingOnboarding: () => false,
}));
jest.mock('../../src/features/onboarding/use-onboarding-gate', () => ({
  useOnboardingGate: () => false,
}));
let mockLanding: 'food' | 'gym' = 'food';
jest.mock('../../src/features/navigation/use-landing', () => ({
  landingSurfaceSync: () => mockLanding,
  useSyncLandingCache: () => undefined,
}));
jest.mock('../../src/lib/auth-store', () => ({ getToken: () => 'token-trainer' }));
jest.mock('../../src/lib/analytics', () => ({ track: jest.fn() }));
jest.mock('expo-notifications', () => ({ cancelScheduledNotificationAsync: jest.fn() }));

const { router } = jest.requireMock<{ router: { replace: jest.Mock } }>('expo-router');
const { track } = jest.requireMock<{ track: jest.Mock }>('../../src/lib/analytics');
const Haptics = jest.requireMock<{ impactAsync: jest.Mock }>('expo-haptics');

beforeEach(() => {
  setKvBackendForTests(createMemoryKvBackend());
  resetShellModeStoreForTests();
  resetShellStoreForTests();
  resetLandingGateForTests();
  mockLanding = 'food';
  jest.clearAllMocks();
});

describe('mode store', () => {
  it('starts in personal mode with nothing cached', () => {
    expect(getShellMode()).toBe('personal');
    expect(isTrainerModeAvailableCached()).toBe(false);
    expect(landingShellModeSync()).toBe('personal');
  });

  it('persists the mode and the answer, and reads them back on the next launch', () => {
    setShellMode('trainer');
    setTrainerModeAvailableCache(true);
    // A cold start: the in-memory copies are gone, the KV is not.
    resetShellModeStoreForTests();
    expect(getShellMode()).toBe('trainer');
    expect(isTrainerModeAvailableCached()).toBe(true);
    expect(landingShellModeSync()).toBe('trainer');
  });

  it('a remembered trainer mode no longer available lands in personal mode', () => {
    setShellMode('trainer');
    setTrainerModeAvailableCache(false);
    expect(landingShellModeSync()).toBe('personal');
  });

  it('sign-out keeps the device mode but forgets the account’s answer', async () => {
    setShellMode('trainer');
    setTrainerModeAvailableCache(true);
    await clearLocalUserData({ keepGymData: false });
    expect(kv.getString('shell.mode')).toBe('trainer');
    expect(isTrainerModeAvailableCached()).toBe(false);
    resetShellModeStoreForTests();
    expect(getShellMode()).toBe('trainer');
    expect(landingShellModeSync()).toBe('personal');
  });
});

describe('cold-start landing on "/"', () => {
  it('a trainer who left in trainer mode opens trainer Today (new shell)', async () => {
    setShellV2Preview(true);
    setShellMode('trainer');
    setTrainerModeAvailableCache(true);
    // Even a Gym landing (TRAIN-only account) loses to the remembered trainer mode.
    mockLanding = 'gym';
    await render(<FoodTabsLayout />);
    expect(screen.getByTestId('redirect')).toHaveTextContent(/\(trainer\)\/today/);
  });

  it('and in the old shell', async () => {
    setShellMode('trainer');
    setTrainerModeAvailableCache(true);
    await render(<FoodTabsLayout />);
    expect(screen.getByTestId('redirect')).toHaveTextContent(/\(trainer\)\/today/);
  });

  it('personal mode lands as before', async () => {
    setShellV2Preview(true);
    setTrainerModeAvailableCache(true);
    await render(<FoodTabsLayout />);
    expect(screen.getByTestId('redirect')).toHaveTextContent(/"\/home"/);
  });

  it('trainer mode no longer available: personal Today', async () => {
    setShellV2Preview(true);
    setShellMode('trainer');
    await render(<FoodTabsLayout />);
    expect(screen.getByTestId('redirect')).toHaveTextContent(/"\/home"/);
  });
});

describe('foreground re-landing', () => {
  it('never moves a device in trainer mode', () => {
    expect(relandTarget(['(food)'], 'gym', 'trainer')).toBeNull();
    expect(relandTarget(['(gym)', 'today'], 'food', 'trainer')).toBeNull();
    expect(relandTarget(['(trainer)', 'today'], 'gym')).toBeNull();
    expect(relandTarget(['(trainer)', 'clients'], 'food')).toBeNull();
  });

  it('personal mode re-lands as before', () => {
    expect(relandTarget(['(food)'], 'gym', 'personal')).toBe('/today');
  });
});

describe('switchShellMode', () => {
  it('to trainer: light haptic, remembered, counted, announced, lands on trainer Today', () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    switchShellMode('trainer');
    expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
    expect(getShellMode()).toBe('trainer');
    expect(kv.getString('shell.mode')).toBe('trainer');
    expect(track).toHaveBeenCalledWith('trainer_mode_switched', { to: 'trainer' });
    expect(announce).toHaveBeenCalledWith('Trainer mode');
    expect(router.replace).toHaveBeenCalledWith('/(trainer)/today');
  });

  it('to personal: the new shell’s /home, or "/" in the old shell', () => {
    setShellMode('trainer');
    switchShellMode('personal');
    expect(getShellMode()).toBe('personal');
    expect(router.replace).toHaveBeenLastCalledWith('/');
    expect(track).toHaveBeenCalledWith('trainer_mode_switched', { to: 'personal' });
    setShellV2Preview(true);
    expect(personalHomeHref()).toBe('/home');
    switchShellMode('personal');
    expect(router.replace).toHaveBeenLastCalledWith('/home');
  });
});

describe('shell routes', () => {
  it('maps Trainer tools to trainer mode’s Clients tab, and nothing else', () => {
    expect(trainerModePathFor('/trainer')).toBe('/(trainer)/clients');
    expect(trainerModePathFor('/trainer/invite')).toBeNull();
  });
});
