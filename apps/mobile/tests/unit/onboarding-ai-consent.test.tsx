import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fireEvent, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import {
  AiConsentHost,
  AiConsentProvider,
} from '../../src/features/ai-consent/ai-consent-provider';
import { OnboardingWizard } from '../../src/features/onboarding/onboarding-wizard';

// UX-03 AC7 (rev 2, delta rule 3): finishing a food path auto-generates the
// first week — a premium account is asked for AI consent first
// (useAiConsent('meal-plan', …)); "Not now" sends nothing and never blocks
// onboarding (it still lands on Food Today); free users are never asked
// (free generation is curated, not AI). Uses the REAL AiConsentProvider/
// AiConsentHost (not a stub) so this is an integration check of the gate
// actually wired in front of mealPlan.generate, not just the gate itself
// (already covered generically by ai-consent.test.tsx).

let mockIsPremium = false;
jest.mock('../../src/hooks/use-is-premium', () => ({
  useIsPremium: () => mockIsPremium,
}));

const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  router: {
    push: (href: string): void => {
      mockPush(href);
    },
    replace: (href: string): void => {
      mockReplace(href);
    },
  },
}));
jest.mock('../../src/features/gym/mode-store', () => ({ setMode: jest.fn() }));

let mockUser: { aiDataConsentAt: Date | null } | undefined;
const mockGrant = jest.fn();
const mockGenerate = jest.fn();
const SHAPE = {
  slots: ['breakfast', 'lunch', 'dinner'],
  days: [0, 1, 2, 3, 4, 5, 6],
  timeCapMins: null,
  weekendNoLimit: false,
  cookingFor: null,
  leftovers: false,
};

jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      preferences: { invalidate: jest.fn() },
      dashboard: { invalidate: jest.fn() },
      user: { me: { setData: jest.fn() } },
    }),
    preferences: {
      get: {
        useQuery: () => ({
          data: { chefProfile: null, dietaryPreferences: null, jobs: [] },
          isLoading: false,
          isError: false,
          refetch: jest.fn(),
        }),
      },
      setJobs: {
        useMutation: () => ({
          mutate: jest.fn(),
          mutateAsync: jest.fn().mockResolvedValue({ jobs: ['PLAN_MEALS'], intent: 'EAT_BETTER' }),
          isPending: false,
        }),
      },
      updateSafety: { useMutation: () => ({ mutateAsync: jest.fn(), isPending: false }) },
      saveProfileBasics: { useMutation: () => ({ mutateAsync: jest.fn(), isPending: false }) },
      updateTargets: { useMutation: () => ({ mutateAsync: jest.fn(), isPending: false }) },
      setDisplayPreferences: { useMutation: () => ({ mutateAsync: jest.fn(), isPending: false }) },
    },
    training: { setDayKinds: { useMutation: () => ({ mutateAsync: jest.fn() }) } },
    mealPlan: {
      setShape: { useMutation: () => ({ mutateAsync: jest.fn(), isPending: false }) },
      getShape: { useQuery: () => ({ data: SHAPE }) },
      generate: { useMutation: () => ({ mutate: mockGenerate }) },
    },
    profile: { aiProviders: { useQuery: () => ({ data: undefined }) } },
    user: {
      me: { useQuery: () => ({ data: mockUser }) },
      grantAiDataConsent: {
        useMutation: () => ({
          mutate: (_input: undefined, opts?: { onSuccess?: () => void }) => {
            mockGrant();
            opts?.onSuccess?.();
          },
          reset: jest.fn(),
          isPending: false,
          isError: false,
        }),
      },
    },
  },
}));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

async function renderWizard() {
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <AiConsentProvider signedIn>
        <OnboardingWizard />
        <AiConsentHost />
      </AiConsentProvider>
    </SafeAreaProvider>,
  );
}

/**
 * Jobs -> Diet -> How you cook -> Goal -> Metrics -> (Cuisine, premium only)
 * -> Finish (food-only, no Train/Track). Keeps pressing Continue until the
 * button reads the finish label, so it works for both the free (5-step) and
 * premium (6-step, trailing Cuisine) chains without hard-coding a count.
 */
async function driveToFinish() {
  const user = userEvent.setup();
  await user.press(screen.getByTestId('onboarding-job-PLAN_MEALS'));
  for (let i = 0; i < 10; i++) {
    await waitFor(() => expect(screen.getByTestId('onboarding-continue')).toBeTruthy());
    const isFinish = screen.queryByText('Plan my first week') !== null;
    await user.press(screen.getByTestId('onboarding-continue'));
    if (isFinish) return;
  }
  throw new Error('driveToFinish: never reached the finish button within 10 steps');
}

beforeEach(() => {
  jest.clearAllMocks();
  mockIsPremium = false;
  mockUser = { aiDataConsentAt: null };
});

beforeAll(() => {
  // Same reasoning as ai-consent.test.tsx: the sheet reports "fully gone"
  // through Modal.onDismiss (iOS), which the test renderer never fires.
  jest.replaceProperty(Platform, 'OS', 'android');
});

describe('Onboarding AC7 — AI consent before the first-week generate', () => {
  it('free tier: never asks, generates immediately', async () => {
    mockIsPremium = false;
    await renderWizard();
    await driveToFinish();

    await waitFor(() => expect(mockGenerate).toHaveBeenCalledWith({ weekOffset: 0 }));
    expect(screen.queryByTestId('ai-consent-allow')).toBeNull();
    expect(mockReplace).toHaveBeenCalledWith('/(food)');
  });

  it('premium tier: asks first; "Not now" sends nothing and still finishes onboarding', async () => {
    mockIsPremium = true;
    await renderWizard();
    await driveToFinish();

    await waitFor(() => expect(screen.getByTestId('ai-consent-not-now')).toBeTruthy());
    expect(mockGenerate).not.toHaveBeenCalled();
    // Finishing onboarding itself doesn't wait on the consent decision.
    expect(mockReplace).toHaveBeenCalledWith('/(food)');

    await fireEvent.press(screen.getByTestId('ai-consent-not-now'));
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(mockGrant).not.toHaveBeenCalled();
  });

  it('premium tier: "Allow" records consent, then generates', async () => {
    mockIsPremium = true;
    await renderWizard();
    await driveToFinish();

    await waitFor(() => expect(screen.getByTestId('ai-consent-allow')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('ai-consent-allow'));

    expect(mockGrant).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mockGenerate).toHaveBeenCalledWith({ weekOffset: 0 }));
  });
});
