import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { OnboardingWizard } from '../../src/features/onboarding/onboarding-wizard';

// UX-ONB-09: Finish used to fail silently (four of the save mutations had no
// onError and the catch was empty) and could be tapped again mid-save.

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

const mockSetJobs = jest.fn();
const mockSetShape = jest.fn();
const mockSetDisplayPrefs = jest.fn();
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
      mealPlan: { invalidate: jest.fn() },
      shoppingList: { invalidate: jest.fn() },
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
      setJobs: { useMutation: () => ({ mutateAsync: mockSetJobs, isPending: false }) },
      updateSafety: { useMutation: () => ({ mutateAsync: jest.fn(), isPending: false }) },
      saveProfileBasics: { useMutation: () => ({ mutateAsync: jest.fn(), isPending: false }) },
      updateTargets: { useMutation: () => ({ mutateAsync: jest.fn(), isPending: false }) },
      setDisplayPreferences: {
        useMutation: () => ({ mutateAsync: mockSetDisplayPrefs, isPending: false }),
      },
    },
    training: { setDayKinds: { useMutation: () => ({ mutateAsync: jest.fn() }) } },
    mealPlan: {
      setShape: { useMutation: () => ({ mutateAsync: mockSetShape, isPending: false }) },
      getShape: { useQuery: () => ({ data: SHAPE }) },
      generate: { useMutation: () => ({ mutate: mockGenerate }) },
    },
  },
}));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

async function driveToFinish() {
  const user = userEvent.setup();
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <OnboardingWizard />
    </SafeAreaProvider>,
  );
  await user.press(screen.getByTestId('onboarding-job-PLAN_MEALS'));
  for (let i = 0; i < 10; i++) {
    await waitFor(() => expect(screen.getByTestId('onboarding-continue')).toBeTruthy());
    if (screen.queryByText('Plan my first week') !== null) return user;
    await user.press(screen.getByTestId('onboarding-continue'));
  }
  throw new Error('never reached the finish button');
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSetJobs.mockResolvedValue({ jobs: ['PLAN_MEALS'] });
  mockSetShape.mockResolvedValue(undefined);
  mockSetDisplayPrefs.mockResolvedValue(undefined);
});

describe('Onboarding Finish (UX-ONB-09)', () => {
  it('a failing save step shows its error and Finish can be tapped again', async () => {
    mockSetShape.mockRejectedValueOnce(new Error('Could not save your plan shape.'));
    const user = await driveToFinish();
    await user.press(screen.getByTestId('onboarding-continue'));
    expect(await screen.findByText('Could not save your plan shape.')).toBeOnTheScreen();
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(screen.getByTestId('onboarding-continue')).toBeEnabled();

    // The retry goes through: the error clears and the week is generated.
    await user.press(screen.getByTestId('onboarding-continue'));
    await waitFor(() => expect(mockGenerate).toHaveBeenCalled());
    expect(screen.queryByText('Could not save your plan shape.')).toBeNull();
  });

  it('a second tap mid-save does not start a second save', async () => {
    let release!: () => void;
    mockSetShape.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const user = await driveToFinish();
    await user.press(screen.getByTestId('onboarding-continue'));
    await waitFor(() => expect(mockSetShape).toHaveBeenCalledTimes(1));
    // (the jobs step saved once on the way here; Finish saves it again)
    const jobsSaves = mockSetJobs.mock.calls.length;
    // Mid-save: the button is busy and a further tap is ignored.
    expect(screen.getByTestId('onboarding-continue')).toBeDisabled();
    await user.press(screen.getByTestId('onboarding-continue'));
    expect(mockSetJobs).toHaveBeenCalledTimes(jobsSaves);
    expect(mockSetShape).toHaveBeenCalledTimes(1);
    release();
    await waitFor(() => expect(mockGenerate).toHaveBeenCalledTimes(1));
  });
});
