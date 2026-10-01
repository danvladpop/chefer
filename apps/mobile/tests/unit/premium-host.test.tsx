import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import {
  closePremium,
  openPremium,
  resetPremiumStoreForTests,
} from '../../src/features/premium/open-premium';
import { PremiumHost } from '../../src/features/premium/premium-host';

// T-10.2: openPremium(source) → the host renders the job-led sheet; Turn on
// Premium is the free `user.upgradePlan` toggle and the success state hands
// over the job's next step. Every open starts on the offer (AC1, AC2).

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: {
    push: (...a: unknown[]) => {
      mockPush(...a);
    },
  },
}));

const mockTrack = jest.fn();
jest.mock('../../src/lib/analytics', () => ({
  track: (...args: unknown[]) => {
    mockTrack(...args);
  },
}));

let mockJobs: string[] = ['PLAN_MEALS'];
let mockMembers: { name: string; isKid: boolean }[] = [];
const mockUpgrade = jest.fn();
const mockInvalidate = jest.fn();
let upgradeOpts: { onSuccess?: () => void; onError?: () => void } = {};
const mockGenerate = jest.fn();
let generateOpts: { onSuccess?: () => void; onError?: (e: Error) => void } = {};
// Consent on record → runs at once; "Not now" → mockConsentAllows = false → nothing runs.
let mockConsentAllows = true;
const mockRequestConsent = jest.fn((_feature: string, run: () => void) => {
  if (mockConsentAllows) run();
});
jest.mock('../../src/features/ai-consent/ai-consent-provider', () => ({
  useAiConsent: () => mockRequestConsent,
  AiConsentHost: () => null,
}));

jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      invalidate: mockInvalidate,
      mealPlan: { invalidate: mockInvalidate },
      shoppingList: { invalidate: mockInvalidate },
    }),
    mealPlan: {
      generate: {
        useMutation: (opts: typeof generateOpts) => {
          generateOpts = opts;
          return { mutate: mockGenerate, isPending: false, reset: jest.fn() };
        },
      },
    },
    profile: { flags: { useQuery: () => ({ data: {} }) } },
    preferences: {
      get: { useQuery: () => ({ data: { jobs: mockJobs } }) },
      hasProfile: { useQuery: () => ({ data: true }) },
    },
    household: { list: { useQuery: () => ({ data: mockMembers }) } },
    user: {
      upgradePlan: {
        useMutation: (opts: typeof upgradeOpts) => {
          upgradeOpts = opts;
          return { mutate: mockUpgrade, isPending: false, reset: jest.fn() };
        },
      },
    },
  },
}));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

async function renderHost() {
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <PremiumHost />
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  resetPremiumStoreForTests();
  mockJobs = ['PLAN_MEALS'];
  mockMembers = [];
  mockConsentAllows = true;
});

describe('PremiumHost', () => {
  it('renders nothing until a lock opens it, then headlines the source’s job', async () => {
    await renderHost();
    expect(screen.queryByTestId('premium-sheet-title')).toBeNull();
    await act(() => {
      openPremium('recipe-import');
    });
    expect(screen.getByTestId('premium-sheet-title')).toHaveTextContent(
      'Turn your saved links and videos into recipes',
    );
    expect(screen.getByText('INCLUDED')).toBeOnTheScreen();
    expect(mockTrack).toHaveBeenCalledWith('upgrade_prompt_shown', {
      source: 'recipe-import',
      job: 'recipe-import',
    });
  });

  it('fills the household headline from the table and keeps the gym-first default for Train users', async () => {
    mockMembers = [
      { name: 'Ana', isKid: false },
      { name: 'Luca', isKid: true },
      { name: 'Mia', isKid: false },
    ];
    await renderHost();
    await act(() => {
      openPremium('household');
    });
    expect(screen.getByTestId('premium-sheet-title')).toHaveTextContent(
      'Keep portions for your table of 4',
    );
    await act(() => {
      closePremium();
    });

    mockJobs = ['TRAIN'];
    await act(() => {
      openPremium('profile');
    });
    expect(screen.getByTestId('premium-sheet-title')).toHaveTextContent(
      'Food that fits your training week',
    );
    expect(screen.getByText('Everything in the gym stays free')).toBeOnTheScreen();
  });

  it('Turn on Premium flips the plan, then shows Premium is on with the job’s next step', async () => {
    const user = userEvent.setup();
    await renderHost();
    await act(() => {
      openPremium('household');
    });
    await user.press(screen.getByTestId('premium-sheet-turn-on'));
    expect(mockUpgrade).toHaveBeenCalledTimes(1);
    expect(mockTrack).toHaveBeenCalledWith('upgrade_clicked', {
      source: 'household',
      job: 'household',
    });

    await act(() => {
      upgradeOpts.onSuccess?.();
    });
    expect(screen.getByTestId('premium-sheet-title')).toHaveTextContent('Premium is on');
    expect(mockInvalidate).toHaveBeenCalled();
    expect(mockTrack).toHaveBeenCalledWith('upgrade_completed', {
      source: 'household',
      job: 'household',
    });

    // No table yet: the household job leads with "Add your table".
    await user.press(screen.getByTestId('premium-sheet-action'));
    expect(mockPush).toHaveBeenCalledWith('/household');
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('AC6: a household lock with a table upgrades, then builds next week sized to the table', async () => {
    mockMembers = [
      { name: 'Ana', isKid: false },
      { name: 'Luca', isKid: true },
    ];
    const user = userEvent.setup();
    await renderHost();
    await act(() => {
      openPremium('household');
    });
    await user.press(screen.getByTestId('premium-sheet-turn-on'));
    await act(() => {
      upgradeOpts.onSuccess?.();
    });

    expect(screen.getByText('Scale next week to 3 portions')).toBeOnTheScreen();
    await user.press(screen.getByTestId('premium-sheet-action'));
    // AI consent is asked first (the generation is an AI entry point) ...
    expect(mockRequestConsent).toHaveBeenCalledWith('meal-plan', expect.any(Function));
    // ... and the week is built for next week, keeping the user's picks.
    expect(mockGenerate).toHaveBeenCalledWith({ weekOffset: 1, keepPinned: true });

    await act(() => {
      generateOpts.onSuccess?.();
    });
    expect(mockPush).toHaveBeenCalledWith('/meal-plan');
  });

  it('"Not now" on the AI consent sends nothing', async () => {
    mockMembers = [{ name: 'Luca', isKid: true }];
    mockConsentAllows = false;
    const user = userEvent.setup();
    await renderHost();
    await act(() => {
      openPremium('household');
    });
    await act(() => {
      upgradeOpts.onSuccess?.();
    });
    await user.press(screen.getByTestId('premium-sheet-action'));
    expect(mockRequestConsent).toHaveBeenCalledTimes(1);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('a failed week build says so and keeps the action', async () => {
    mockMembers = [{ name: 'Luca', isKid: true }];
    await renderHost();
    await act(() => {
      openPremium('household');
    });
    await act(() => {
      upgradeOpts.onSuccess?.();
    });
    await act(() => {
      generateOpts.onError?.(new Error('Something went wrong'));
    });
    expect(screen.getByTestId('premium-sheet-action-error')).toHaveTextContent(
      'Something went wrong',
    );
    expect(screen.getByTestId('premium-sheet-action')).toBeOnTheScreen();
  });

  it('an error keeps the offer, says nothing changed and offers Try again', async () => {
    await renderHost();
    await act(() => {
      openPremium('pantry');
    });
    await act(() => {
      upgradeOpts.onError?.();
    });
    expect(screen.getByTestId('premium-sheet-error')).toBeOnTheScreen();
    expect(screen.getByText('INCLUDED')).toBeOnTheScreen();
    expect(screen.getByText('Try again')).toBeOnTheScreen();
  });

  it('each open starts on the offer again', async () => {
    const user = userEvent.setup();
    await renderHost();
    await act(() => {
      openPremium('pantry');
    });
    await act(() => {
      upgradeOpts.onSuccess?.();
    });
    expect(screen.getByTestId('premium-sheet-title')).toHaveTextContent('Premium is on');
    await user.press(screen.getByTestId('premium-sheet-later'));
    await act(() => {
      openPremium('chat-locked');
    });
    expect(screen.getByTestId('premium-sheet-title')).toHaveTextContent('Ask the chef');
    expect(screen.getByTestId('premium-sheet-turn-on')).toBeOnTheScreen();
  });

  it('is a quiet no-op when no host is mounted', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(() => openPremium('pantry')).not.toThrow();
    warn.mockRestore();
  });
});
