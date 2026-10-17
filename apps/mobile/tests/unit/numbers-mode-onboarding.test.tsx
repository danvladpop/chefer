import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { OnboardingWizard } from '../../src/features/onboarding/onboarding-wizard';

// WP-08: onboarding's goal step asks "What do you want to keep an eye on?".
// "Just protein" is saved at Finish through preferences.setNumbersMode (and only
// then, so an abandoned setup leaves no half-made profile).

jest.mock('../../src/features/privacy/use-health-consent', () => ({
  useHealthConsent: () => ({
    consented: true,
    requestHealthConsent: (run: () => void) => run(),
    healthConsentSheet: null,
  }),
}));
jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't close over top-of-file imports
  const { createElement, useEffect } = require('react') as typeof import('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Pressable } = require('react-native') as typeof import('react-native');
  return {
    useFocusEffect: (effect: () => (() => void) | undefined): void => {
      useEffect(effect, [effect]);
    },
    router: { push: jest.fn(), replace: jest.fn() },
    Link: ({ children, testID }: { children: React.ReactNode; testID?: string }) =>
      createElement(Pressable, { testID }, children),
  };
});
jest.mock('../../src/features/gym/mode-store', () => ({ setMode: jest.fn() }));
jest.mock('../../src/hooks/use-is-premium', () => ({ useIsPremium: () => false }));
jest.mock('../../src/features/ai-consent/ai-consent-provider', () => ({
  useAiConsent: () => (_feature: string, run: () => void) => run(),
}));

const mockSetNumbersMode = jest.fn();
const mockGenerate = jest.fn();
let mockSavedNumbersMode: string | null = null;

jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      preferences: { invalidate: jest.fn() },
      dashboard: { invalidate: jest.fn() },
      mealPlan: { invalidate: jest.fn() },
      shoppingList: { invalidate: jest.fn() },
    }),
    preferences: {
      get: {
        useQuery: () => ({
          data: {
            chefProfile: null,
            dietaryPreferences: null,
            jobs: [],
            numbersMode: mockSavedNumbersMode ?? 'FULL',
          },
          isLoading: false,
          isError: false,
          refetch: jest.fn(),
        }),
      },
      setJobs: {
        useMutation: () => ({
          mutateAsync: jest.fn().mockResolvedValue({ jobs: ['PLAN_MEALS'] }),
          isPending: false,
        }),
      },
      updateSafety: { useMutation: () => ({ mutateAsync: jest.fn(), isPending: false }) },
      saveProfileBasics: { useMutation: () => ({ mutateAsync: jest.fn(), isPending: false }) },
      updateTargets: { useMutation: () => ({ mutateAsync: jest.fn(), isPending: false }) },
      setDisplayPreferences: { useMutation: () => ({ mutateAsync: jest.fn(), isPending: false }) },
      setNumbersMode: {
        useMutation: () => ({
          mutateAsync: (input: unknown) => {
            mockSetNumbersMode(input);
            return Promise.resolve(input);
          },
          isPending: false,
        }),
      },
    },
    training: { setDayKinds: { useMutation: () => ({ mutateAsync: jest.fn() }) } },
    household: { list: { useQuery: () => ({ data: [] }) } },
    mealPlan: {
      setShape: { useMutation: () => ({ mutateAsync: jest.fn(), isPending: false }) },
      getShape: { useQuery: () => ({ data: undefined }) },
      generate: { useMutation: () => ({ mutate: mockGenerate }) },
    },
    targets: {
      get: { useQuery: () => ({ data: undefined, isLoading: true, isError: false }) },
      set: { useMutation: () => ({ mutate: jest.fn(), isPending: false }) },
    },
  },
}));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

async function startWizard() {
  const user = userEvent.setup();
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <OnboardingWizard />
    </SafeAreaProvider>,
  );
  await user.press(screen.getByTestId('onboarding-job-PLAN_MEALS'));
  return user;
}

/** Continue until a testID is on screen (the goal step), or until Finish. */
async function continueUntil(user: ReturnType<typeof userEvent.setup>, testID: string) {
  for (let i = 0; i < 10; i++) {
    await waitFor(() => expect(screen.getByTestId('onboarding-continue')).toBeTruthy());
    if (screen.queryByTestId(testID) !== null) return;
    await user.press(screen.getByTestId('onboarding-continue'));
  }
  throw new Error(`never reached ${testID}`);
}

async function finish(user: ReturnType<typeof userEvent.setup>) {
  for (let i = 0; i < 10; i++) {
    await waitFor(() => expect(screen.getByTestId('onboarding-continue')).toBeTruthy());
    if (screen.queryByText('Plan my first week') !== null) break;
    await user.press(screen.getByTestId('onboarding-continue'));
  }
  await user.press(screen.getByTestId('onboarding-continue'));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSavedNumbersMode = null;
});

describe('Onboarding — "What do you want to keep an eye on?" (WP-08)', () => {
  it('offers Calories and macros (selected) and Just protein on the goal step', async () => {
    const user = await startWizard();
    await continueUntil(user, 'onb-numbers-choice');
    expect(screen.getByText('What do you want to keep an eye on?')).toBeOnTheScreen();
    expect(screen.getByText('Calories and macros')).toBeOnTheScreen();
    expect(screen.getByText('Just protein')).toBeOnTheScreen();
    expect(screen.getByTestId('onb-numbers-full').props).toMatchObject({
      accessibilityState: { selected: true },
    });
  });

  it('choosing Just protein is saved at Finish with setNumbersMode', async () => {
    const user = await startWizard();
    await continueUntil(user, 'onb-numbers-choice');
    await user.press(screen.getByTestId('onb-numbers-protein'));
    // Nothing is written before Finish.
    expect(mockSetNumbersMode).not.toHaveBeenCalled();
    await finish(user);
    await waitFor(() =>
      expect(mockSetNumbersMode).toHaveBeenCalledWith({ numbersMode: 'PROTEIN_ONLY' }),
    );
    expect(mockSetNumbersMode).toHaveBeenCalledTimes(1);
  });

  it('keeping Calories and macros writes nothing', async () => {
    const user = await startWizard();
    await continueUntil(user, 'onb-numbers-choice');
    await finish(user);
    await waitFor(() => expect(mockGenerate).toHaveBeenCalled());
    expect(mockSetNumbersMode).not.toHaveBeenCalled();
  });

  it('"Just good food" has no numbers to choose between, and saves no mode', async () => {
    const user = await startWizard();
    await continueUntil(user, 'onb-numbers-choice');
    await user.press(screen.getByTestId('onb-numbers-protein'));
    await user.press(screen.getByTestId('goal-good-food'));
    expect(screen.queryByTestId('onb-numbers-choice')).not.toBeOnTheScreen();
    await finish(user);
    await waitFor(() => expect(mockGenerate).toHaveBeenCalled());
    expect(mockSetNumbersMode).not.toHaveBeenCalled();
  });

  it('a saved Just protein is pre-selected when the wizard is re-opened', async () => {
    mockSavedNumbersMode = 'PROTEIN_ONLY';
    const user = await startWizard();
    await continueUntil(user, 'onb-numbers-choice');
    expect(screen.getByTestId('onb-numbers-protein').props).toMatchObject({
      accessibilityState: { selected: true },
    });
  });
});
