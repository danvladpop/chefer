import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { claimLanding, resetLandingGateForTests } from '../../src/features/navigation/landing-gate';
import {
  clearOnboardingV4Draft,
  readOnboardingV4Draft,
} from '../../src/features/onboarding-v4/draft-store';
import { OnboardingV4 } from '../../src/features/onboarding-v4/onboarding-v4';
import { readOnboardingV4Welcome } from '../../src/features/onboarding-v4/welcome-card-store';

// Onboarding V4 (flag `onboardingV4`, docs/onboarding-review-2026-10): the
// short flow saves through the same procedures as V3 and lands on Today.

// A metric region (the test runner's locale is en-US → imperial).
jest.mock('@chefer/utils', () => ({
  ...jest.requireActual<typeof import('@chefer/utils')>('@chefer/utils'),
  detectRegion: () => 'RO',
}));

jest.mock('../../src/lib/auth-store', () => ({ getToken: () => 'token-A' }));

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't close over imports
  const { useEffect } = require('react') as typeof import('react');
  return {
    useFocusEffect: (effect: () => (() => void) | undefined): void => {
      useEffect(effect, [effect]);
    },
    router: {
      push: (...a: unknown[]) => {
        mockRouter.push(...a);
      },
      replace: (...a: unknown[]) => {
        mockRouter.replace(...a);
      },
      back: () => {
        mockRouter.back();
      },
    },
  };
});
jest.mock('../../src/features/privacy/use-health-consent', () => ({
  useHealthConsent: () => ({
    consented: true,
    requestHealthConsent: (run: () => void) => run(),
    healthConsentSheet: null,
  }),
}));
jest.mock('../../src/features/ai-consent/ai-consent-provider', () => ({
  useAiConsent: () => (_feature: string, run: () => void) => run(),
}));
const mockSetMode = jest.fn();
jest.mock('../../src/features/gym/mode-store', () => ({
  setMode: (m: string) => {
    mockSetMode(m);
  },
}));
jest.mock('../../src/features/gym/use-gym-bootstrap', () => ({
  gymBootstrapQueryKey: ['gym', 'bootstrap'],
}));
let mockPremium = false;
jest.mock('../../src/hooks/use-is-premium', () => ({ useIsPremium: () => mockPremium }));

const mockSetJobs = jest.fn();
const mockDisplayPrefs = jest.fn();
const mockBasics = jest.fn();
const mockSafety = jest.fn();
const mockGenerate = jest.fn();
const mockUpgrade = jest.fn();
const mockCompleteSetup = jest.fn();

const PLAN = {
  planId: 'p1',
  days: [0, 1, 2, 3, 4, 5, 6].map((day) => ({
    dayOfWeek: day,
    meals: [
      {
        type: 'breakfast',
        recipe: { id: `b${day}`, name: 'Oats', nutritionInfo: { calories: 300 } },
      },
      {
        type: 'dinner',
        recipe: { id: `d${day}`, name: `Dinner ${day}`, nutritionInfo: { calories: 520 } },
      },
    ],
  })),
};

type MutationOpts =
  | { onSuccess?: (data: unknown) => void; onError?: (e: unknown) => void }
  | undefined;

jest.mock('../../src/lib/trpc', () => {
  const invalidate = jest.fn();
  // Lazy: jest hoists this factory above the mock fns' declarations.
  const asyncMutation = (get: () => jest.Mock) => () => ({
    mutateAsync: (...args: unknown[]) => get()(...args) as Promise<unknown>,
    isPending: false,
  });
  return {
    trpc: {
      useUtils: () => ({
        invalidate,
        preferences: { invalidate, get: { invalidate } },
        dashboard: { invalidate },
        mealPlan: { invalidate },
        shoppingList: { invalidate },
      }),
      preferences: {
        setJobs: { useMutation: asyncMutation(() => mockSetJobs) },
        setDisplayPreferences: { useMutation: asyncMutation(() => mockDisplayPrefs) },
        saveProfileBasics: { useMutation: asyncMutation(() => mockBasics) },
        updateSafety: { useMutation: asyncMutation(() => mockSafety) },
      },
      mealPlan: { generate: { useMutation: asyncMutation(() => mockGenerate) } },
      shoppingList: {
        getForWeek: { useQuery: () => ({ data: { items: new Array(23).fill({}) } }) },
      },
      user: {
        me: { useQuery: () => ({ data: { firstName: 'Dana' } }) },
        upgradePlan: {
          useMutation: (opts: MutationOpts) => ({
            mutate: () => {
              mockUpgrade();
              opts?.onSuccess?.(undefined);
            },
            isPending: false,
          }),
        },
      },
      gym: {
        profile: {
          recommend: {
            useQuery: (_input: unknown, o: { enabled: boolean }) => ({
              data: o.enabled
                ? {
                    recommendedKey: 'full-body-3',
                    preview: { name: 'Full Body 3×' },
                    alternatives: [{ key: 'upper-lower-3', name: 'Upper / Lower 3×' }],
                  }
                : undefined,
            }),
          },
          completeSetup: {
            useMutation: (opts: MutationOpts) => ({
              mutate: (input: unknown) => {
                mockCompleteSetup(input);
                opts?.onSuccess?.({});
              },
              isPending: false,
            }),
          },
        },
      },
    },
  };
});

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

async function renderFlow() {
  const user = userEvent.setup();
  const client = new QueryClient();
  await render(
    <QueryClientProvider client={client}>
      <SafeAreaProvider initialMetrics={metrics}>
        <OnboardingV4 />
      </SafeAreaProvider>
    </QueryClientProvider>,
  );
  return user;
}

async function aboutYou(user: ReturnType<typeof userEvent.setup>, days: number[] = []) {
  await user.type(screen.getByTestId('onb-v4-age'), '30');
  await user.type(screen.getByTestId('onb-v4-height'), '168');
  await user.type(screen.getByTestId('onb-v4-weight'), '72');
  for (const d of days) await user.press(screen.getByTestId(`onb-v4-day-${d}`));
}

beforeEach(() => {
  jest.clearAllMocks();
  resetLandingGateForTests();
  clearOnboardingV4Draft();
  mockPremium = false;
  mockSetJobs.mockResolvedValue({});
  mockDisplayPrefs.mockResolvedValue({});
  mockBasics.mockResolvedValue({});
  mockSafety.mockResolvedValue({});
  mockGenerate.mockResolvedValue(PLAN);
});

describe('Onboarding V4', () => {
  it('meals + train: saves, builds and reveals the week, offers Premium, sets up training, lands on Today', async () => {
    const user = await renderFlow();
    expect(screen.getByTestId('onb-v4-continue')).toBeDisabled();
    await user.press(screen.getByTestId('onb-v4-job-PLAN_MEALS'));
    await user.press(screen.getByTestId('onb-v4-job-TRAIN'));
    await user.press(screen.getByTestId('onb-v4-continue'));
    await waitFor(() =>
      expect(mockSetJobs).toHaveBeenCalledWith({ jobs: ['PLAN_MEALS', 'TRAIN'] }),
    );

    await screen.findByTestId('onb-v4-goal');
    await user.press(screen.getByTestId('onb-v4-goal-LOSE_WEIGHT'));
    await user.press(screen.getByTestId('onb-v4-continue'));

    await screen.findByTestId('onb-v4-aboutYou');
    await aboutYou(user, [0, 2, 4]);
    expect(screen.getByTestId('onb-v4-target')).toBeOnTheScreen();
    await user.press(screen.getByTestId('onb-v4-continue'));
    await waitFor(() =>
      expect(mockBasics).toHaveBeenCalledWith(
        expect.objectContaining({
          goal: 'LOSE_WEIGHT',
          age: 30,
          heightCm: 168,
          weightKg: 72,
          activityLevel: 'MODERATELY_ACTIVE',
        }),
      ),
    );
    expect(mockSetJobs).toHaveBeenLastCalledWith({
      jobs: ['PLAN_MEALS', 'TRAIN'],
      trainingWeekdays: [0, 2, 4],
    });
    expect(mockDisplayPrefs).toHaveBeenCalled();

    await screen.findByTestId('onb-v4-safety');
    expect(screen.getByTestId('onb-v4-safety-everything')).toBeChecked();
    await user.press(screen.getByTestId('onb-v4-safety-fish'));
    await user.press(screen.getByTestId('onb-v4-continue'));
    await waitFor(() => expect(mockSafety).toHaveBeenCalled());
    const [saved] = mockSafety.mock.calls[0] as [{ allergies: string[] }];
    expect(saved.allergies).toHaveLength(2);

    await waitFor(() => expect(mockGenerate).toHaveBeenCalledWith({ weekOffset: 0 }));
    await screen.findByTestId('onb-v4-ready');
    expect(screen.getByText('Dinner 0')).toBeOnTheScreen();
    expect(screen.getByText('23 items on your list')).toBeOnTheScreen();
    await user.press(screen.getByTestId('onb-v4-continue'));

    await screen.findByTestId('onb-v4-premium');
    await user.press(screen.getByTestId('onb-v4-premium-on'));
    expect(mockUpgrade).toHaveBeenCalled();
    expect(await screen.findByText('Premium is on')).toBeOnTheScreen();
    await user.press(screen.getByTestId('onb-v4-continue'));

    await screen.findByTestId('onb-v4-train');
    expect(screen.getByText('Full Body 3×')).toBeOnTheScreen();
    await user.press(screen.getByTestId('onb-v4-program-change'));
    expect(screen.getByText('Upper / Lower 3×')).toBeOnTheScreen();
    await user.press(screen.getByTestId('onb-v4-train-start'));
    expect(mockCompleteSetup).toHaveBeenCalledWith(
      expect.objectContaining({
        days: 3,
        templateKey: 'upper-lower-3',
        plannedWeekdays: [0, 2, 4],
        reminderTime: null,
      }),
    );
    expect(mockRouter.replace).toHaveBeenCalledWith('/(food)');
    expect(readOnboardingV4Welcome()).toEqual({ jobs: ['PLAN_MEALS', 'TRAIN'] });
    // The cold-start landing (Train on a training-day afternoon) must not
    // override where setup lands: this sign-in's landing is already decided.
    expect(claimLanding('token-A')).toBe(false);
    expect(readOnboardingV4Draft('token-A')).toBeNull();
  });

  it('UX-ONB-01: a killed app resumes on the same step with the answers so far', async () => {
    const user = await renderFlow();
    await user.press(screen.getByTestId('onb-v4-job-PLAN_MEALS'));
    await user.press(screen.getByTestId('onb-v4-continue'));
    await screen.findByTestId('onb-v4-goal');
    await user.press(screen.getByTestId('onb-v4-goal-LOSE_WEIGHT'));
    await user.press(screen.getByTestId('onb-v4-continue'));
    await screen.findByTestId('onb-v4-aboutYou');
    await user.type(screen.getByTestId('onb-v4-age'), '30');
    expect(readOnboardingV4Draft('token-A')).toMatchObject({
      step: 'aboutYou',
      jobs: ['PLAN_MEALS'],
      goalChoice: 0,
    });
    await screen.unmount();

    // A new process: the same session token, the KV on disk.
    await renderFlow();
    await screen.findByTestId('onb-v4-aboutYou');
    expect(screen.getByTestId('onb-v4-age')).toHaveDisplayValue('30');
  });

  it('a plan built before the kill is not built again', async () => {
    const user = await renderFlow();
    await user.press(screen.getByTestId('onb-v4-job-PLAN_MEALS'));
    await user.press(screen.getByTestId('onb-v4-continue'));
    await screen.findByTestId('onb-v4-goal');
    await user.press(screen.getByTestId('onb-v4-goal-EAT_HEALTHIER'));
    await user.press(screen.getByTestId('onb-v4-continue'));
    await screen.findByTestId('onb-v4-aboutYou');
    await user.press(screen.getByTestId('onb-v4-continue'));
    await screen.findByTestId('onb-v4-safety');
    await user.press(screen.getByTestId('onb-v4-continue'));
    await screen.findByTestId('onb-v4-ready');
    await screen.unmount();

    await renderFlow();
    await screen.findByTestId('onb-v4-premium');
    expect(mockGenerate).toHaveBeenCalledTimes(1);
  });

  it('train only skips the food steps and lands on the gym', async () => {
    const user = await renderFlow();
    await user.press(screen.getByTestId('onb-v4-job-TRAIN'));
    await user.press(screen.getByTestId('onb-v4-continue'));
    await screen.findByTestId('onb-v4-goal');
    await user.press(screen.getByTestId('onb-v4-goal-GAIN_MUSCLE'));
    await user.press(screen.getByTestId('onb-v4-continue'));
    await screen.findByTestId('onb-v4-aboutYou');
    await aboutYou(user, [1, 3]);
    await user.press(screen.getByTestId('onb-v4-continue'));
    await screen.findByTestId('onb-v4-premium');
    expect(mockGenerate).not.toHaveBeenCalled();
    await user.press(screen.getByTestId('onb-v4-premium-later'));
    await screen.findByTestId('onb-v4-train');
    await user.press(screen.getByTestId('onb-v4-train-start'));
    expect(mockSetMode).toHaveBeenCalledWith('gym');
    expect(mockRouter.replace).toHaveBeenCalledWith('/today');
  });

  it('premium users never see the Premium step', async () => {
    mockPremium = true;
    const user = await renderFlow();
    await user.press(screen.getByTestId('onb-v4-job-TRACK'));
    await user.press(screen.getByTestId('onb-v4-continue'));
    await screen.findByTestId('onb-v4-goal');
    await user.press(screen.getByTestId('onb-v4-goal-GOOD_FOOD'));
    await user.press(screen.getByTestId('onb-v4-continue'));
    await screen.findByTestId('onb-v4-aboutYou');
    // "Just good food": no calorie target to show.
    expect(screen.queryByTestId('onb-v4-target')).toBeNull();
    await user.press(screen.getByTestId('onb-v4-continue'));
    await screen.findByTestId('onb-v4-safety');
    await user.press(screen.getByTestId('onb-v4-continue'));
    // Track only: no week to build, no Premium step → done.
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/(food)'));
    expect(screen.queryByTestId('onb-v4-premium')).toBeNull();
    expect(mockSafety).not.toHaveBeenCalled();
  });

  async function toSafetyStep(user: ReturnType<typeof userEvent.setup>) {
    await user.press(screen.getByTestId('onb-v4-job-PLAN_MEALS'));
    await user.press(screen.getByTestId('onb-v4-continue'));
    await screen.findByTestId('onb-v4-goal');
    await user.press(screen.getByTestId('onb-v4-goal-EAT_HEALTHIER'));
    await user.press(screen.getByTestId('onb-v4-continue'));
    await screen.findByTestId('onb-v4-aboutYou');
    await user.press(screen.getByTestId('onb-v4-continue'));
    await screen.findByTestId('onb-v4-safety');
    await user.press(screen.getByTestId('onb-v4-safety-more'));
  }

  it('UX-ACC-01: an allergy typed in "Something else?" without "+" is saved on Continue', async () => {
    const user = await renderFlow();
    await toSafetyStep(user);
    await user.type(screen.getByTestId('onb-v4-more-something-else-input'), 'sesame');
    await user.press(screen.getByTestId('onb-v4-more-done'));
    await waitFor(() => expect(screen.queryByTestId('onb-v4-more-done')).toBeNull());

    await user.press(screen.getByTestId('onb-v4-continue'));
    await waitFor(() => expect(mockSafety).toHaveBeenCalled());
    const [saved] = mockSafety.mock.calls[0] as [{ allergies: string[] }];
    expect(saved.allergies).toContain('Sesame');
  });

  it('UX-ACC-01: an unrecognised typed term keeps the sheet open until the user chooses', async () => {
    const user = await renderFlow();
    await toSafetyStep(user);
    await user.type(screen.getByTestId('onb-v4-more-something-else-input'), 'zzqqxx');
    await user.press(screen.getByTestId('onb-v4-more-done'));
    expect(screen.getByTestId('onb-v4-more-save-blocked')).toHaveTextContent(/zzqqxx/);

    await user.press(screen.getByTestId('onb-v4-more-unchecked-notice-keep-note'));
    await user.press(screen.getByTestId('onb-v4-more-done'));
    await waitFor(() => expect(screen.queryByTestId('onb-v4-more-done')).toBeNull());
    await user.press(screen.getByTestId('onb-v4-continue'));
    await waitFor(() => expect(mockSafety).toHaveBeenCalled());
    expect(JSON.stringify(mockSafety.mock.calls[0])).toContain('zzqqxx');
  });

  it('a failed build offers Try again and Skip', async () => {
    mockGenerate.mockRejectedValueOnce(new Error('The kitchen is busy.'));
    const user = await renderFlow();
    await user.press(screen.getByTestId('onb-v4-job-PLAN_MEALS'));
    await user.press(screen.getByTestId('onb-v4-continue'));
    await screen.findByTestId('onb-v4-goal');
    await user.press(screen.getByTestId('onb-v4-goal-EAT_HEALTHIER'));
    await user.press(screen.getByTestId('onb-v4-continue'));
    await screen.findByTestId('onb-v4-aboutYou');
    await user.press(screen.getByTestId('onb-v4-continue'));
    await screen.findByTestId('onb-v4-safety');
    await user.press(screen.getByTestId('onb-v4-continue'));
    expect(await screen.findByText('The kitchen is busy.')).toBeOnTheScreen();
    expect(screen.getByTestId('onb-v4-build-retry')).toBeOnTheScreen();
    await user.press(screen.getByTestId('onb-v4-build-skip'));
    await screen.findByTestId('onb-v4-premium');
  });
});
