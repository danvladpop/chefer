import { act, render, screen } from '@testing-library/react-native';
import FoodTabsLayout from '../../app/(food)/_layout';
import {
  clearPendingOnboarding,
  requestOnboarding,
} from '../../src/features/auth/pending-onboarding';
import { createMemoryKvBackend, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import {
  onboardingDraftScope,
  writeOnboardingDraft,
  type OnboardingDraftAnswers,
} from '../../src/features/onboarding/onboarding-draft';
import {
  markOnboardingGateHandled,
  resetOnboardingGate,
} from '../../src/features/onboarding/onboarding-gate';

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
// UX-ONB-01: the server-derived "never answered the jobs question" signal.
let mockSavedJobs: string[] | undefined = ['PLAN_MEALS'];
jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    preferences: {
      get: {
        useQuery: () => ({
          data: mockSavedJobs === undefined ? undefined : { jobs: mockSavedJobs },
        }),
      },
    },
  },
}));
let mockLanding: 'food' | 'gym' = 'food';
jest.mock('../../src/features/navigation/use-landing', () => ({
  landingSurfaceSync: () => mockLanding,
  useSyncLandingCache: () => undefined,
}));

beforeEach(() => {
  clearPendingOnboarding();
  resetOnboardingGate();
  setKvBackendForTests(createMemoryKvBackend());
  mockLanding = 'food';
  mockSavedJobs = ['PLAN_MEALS'];
});

const ANSWERS: OnboardingDraftAnswers = {
  step: 2,
  jobs: ['PLAN_MEALS'],
  trainingWeekdays: [],
  trainingDayKinds: {},
  howYouCook: null,
  goodFood: false,
  goal: null,
  metrics: null,
  ageText: '',
  heightText: '',
  weightText: '',
  safety: null,
  cuisine: null,
};

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

  // UX-ONB-01 — an interrupted setup is resumed, from the server or a saved draft.
  describe('resuming an interrupted setup', () => {
    it('redirects when the server says the jobs question was never answered', async () => {
      mockSavedJobs = [];
      await render(<FoodTabsLayout />);
      expect(screen.getByTestId('redirect').props.children).toBe('/onboarding');
    });

    it('does not redirect while the preferences are still loading (or failed)', async () => {
      mockSavedJobs = undefined;
      await render(<FoodTabsLayout />);
      expect(screen.queryByTestId('redirect')).toBeNull();
    });

    it('redirects when this session has a saved draft, even though jobs were saved', async () => {
      writeOnboardingDraft('token-gym-user', ANSWERS);
      await render(<FoodTabsLayout />);
      expect(screen.getByTestId('redirect').props.children).toBe('/onboarding');
    });

    it("ignores (and removes) another session's draft", async () => {
      writeOnboardingDraft('some-other-token', ANSWERS);
      await render(<FoodTabsLayout />);
      expect(screen.queryByTestId('redirect')).toBeNull();
      expect(onboardingDraftScope('some-other-token')).not.toBe(
        onboardingDraftScope('token-gym-user'),
      );
    });

    it('does not redirect again once the wizard has been shown this launch ("Leave for now")', async () => {
      mockSavedJobs = [];
      markOnboardingGateHandled('token-gym-user');
      await render(<FoodTabsLayout />);
      expect(screen.queryByTestId('redirect')).toBeNull();
    });
  });
});
