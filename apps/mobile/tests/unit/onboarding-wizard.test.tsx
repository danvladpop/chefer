import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { OnboardingWizard } from '../../src/features/onboarding/onboarding-wizard';

// UX-03 (T-03.2/T-03.3): the jobs-based onboarding wizard. AC1 (multi-select,
// Continue disabled at 0) and AC2 (Train only hands off to gym setup exactly
// as today) — the fuller flow (training days, how you cook, goal, metrics,
// targets, finish) is covered by the Maestro flow this PR writes for the
// orchestrator to run.

const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  router: {
    push: (...args: unknown[]) => mockPush(...args),
    replace: (...args: unknown[]) => mockReplace(...args),
  },
}));

const mockSetMode = jest.fn();
jest.mock('../../src/features/gym/mode-store', () => ({
  setMode: (...args: unknown[]) => mockSetMode(...args),
}));

jest.mock('../../src/hooks/use-is-premium', () => ({
  useIsPremium: () => false,
}));

const mockRequestAiConsent = jest.fn();
jest.mock('../../src/features/ai-consent/ai-consent-provider', () => ({
  useAiConsent: () => mockRequestAiConsent,
}));

const mockSetJobsMutate = jest.fn();
const mockSetJobsMutateAsync = jest.fn().mockResolvedValue({ jobs: ['TRAIN'], intent: 'TRAIN' });
const mockInvalidate = jest.fn();

jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      preferences: { invalidate: mockInvalidate },
      dashboard: { invalidate: mockInvalidate },
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
          mutate: mockSetJobsMutate,
          mutateAsync: mockSetJobsMutateAsync,
          isPending: false,
        }),
      },
      updateSafety: { useMutation: () => ({ mutateAsync: jest.fn(), isPending: false }) },
      saveProfileBasics: { useMutation: () => ({ mutateAsync: jest.fn(), isPending: false }) },
      updateTargets: { useMutation: () => ({ mutateAsync: jest.fn(), isPending: false }) },
      setDisplayPreferences: { useMutation: () => ({ mutateAsync: jest.fn(), isPending: false }) },
    },
    training: {
      setDayKinds: { useMutation: () => ({ mutateAsync: jest.fn() }) },
    },
    mealPlan: {
      setShape: { useMutation: () => ({ mutateAsync: jest.fn(), isPending: false }) },
      getShape: { useQuery: () => ({ data: undefined }) },
      generate: { useMutation: () => ({ mutate: jest.fn() }) },
    },
  },
}));

describe('OnboardingWizard — Jobs step (UX-03)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('Continue is disabled with nothing selected (AC1)', async () => {
    await render(<OnboardingWizard />);
    const continueBtn = screen.getByTestId('onboarding-continue');
    expect(continueBtn.props.accessibilityState?.disabled).toBe(true);
  });

  it('selecting a job enables Continue and its label counts (AC1)', async () => {
    await render(<OnboardingWizard />);
    await fireEvent.press(screen.getByTestId('onboarding-job-PLAN_MEALS'));
    expect(screen.getByText('Continue — 1 selected')).toBeTruthy();
    const continueBtn = screen.getByTestId('onboarding-continue');
    expect(continueBtn.props.accessibilityState?.disabled).toBeFalsy();
  });

  it('tapping a selected card deselects it (AC1)', async () => {
    await render(<OnboardingWizard />);
    const card = screen.getByTestId('onboarding-job-TRAIN');
    await fireEvent.press(card);
    expect(card.props.accessibilityState.checked).toBe(true);
    await fireEvent.press(card);
    expect(card.props.accessibilityState.checked).toBe(false);
  });

  it('Train only hands off straight to gym setup (AC2)', async () => {
    await render(<OnboardingWizard />);
    await fireEvent.press(screen.getByTestId('onboarding-job-TRAIN'));
    await fireEvent.press(screen.getByTestId('onboarding-continue'));
    await waitFor(() => expect(mockSetJobsMutateAsync).toHaveBeenCalledWith({ jobs: ['TRAIN'] }));
    expect(mockSetMode).toHaveBeenCalledWith('gym');
    expect(mockReplace).toHaveBeenCalledWith('/today');
    expect(mockPush).toHaveBeenCalledWith('/gym/setup');
  });

  it('"Just looking around" saves PLAN_MEALS and skips to Food Today', async () => {
    await render(<OnboardingWizard />);
    await fireEvent.press(screen.getByTestId('onboarding-skip'));
    expect(mockSetJobsMutate).toHaveBeenCalledWith(
      { jobs: ['PLAN_MEALS'] },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });
});
