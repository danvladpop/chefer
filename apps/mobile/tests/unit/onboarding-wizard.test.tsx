import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { OnboardingWizard } from '../../src/features/onboarding/onboarding-wizard';

const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};
// UX-ONB-01: the wizard's "Leave setup?" sheet reads the safe-area insets.
function renderWizard() {
  return render(
    <SafeAreaProvider initialMetrics={SAFE_AREA}>
      <OnboardingWizard />
    </SafeAreaProvider>,
  );
}

// UX-03 (T-03.2/T-03.3): the jobs-based onboarding wizard. AC1 (multi-select,
// Continue disabled at 0) and AC2 (Train only hands off to gym setup exactly
// as today) — the fuller flow (training days, how you cook, goal, metrics,
// targets, finish) is covered by the Maestro flow this PR writes for the
// orchestrator to run.

/** RNTL types `.props` loosely — a small typed peek instead of `any` access. */
function a11yState(
  element: ReturnType<typeof screen.getByTestId>,
): { disabled?: boolean; checked?: boolean } | undefined {
  return (element.props as { accessibilityState?: { disabled?: boolean; checked?: boolean } })
    .accessibilityState;
}

const mockPush = jest.fn();
const mockReplace = jest.fn();
// T-26.2: these tests are about the save itself — the health-consent guard is
// covered in health-consent.test.tsx, so here consent is always on record.
jest.mock('../../src/features/privacy/use-health-consent', () => ({
  useHealthConsent: () => ({
    consented: true,
    requestHealthConsent: (run: () => void) => run(),
    healthConsentSheet: null,
  }),
}));

jest.mock('expo-router', () => ({
  // UX-ONB-01: the screen is always focused here, so run the BACK-handler effect on mount.
  useFocusEffect: (effect: () => (() => void) | undefined): void => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't close over top-of-file imports
    (require('react') as typeof import('react')).useEffect(effect, [effect]);
  },
  router: {
    push: (href: string): void => {
      mockPush(href);
    },
    replace: (href: string): void => {
      mockReplace(href);
    },
  },
}));

const mockSetMode = jest.fn();
jest.mock('../../src/features/gym/mode-store', () => ({
  setMode: (mode: string): void => {
    mockSetMode(mode);
  },
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
    household: { list: { useQuery: () => ({ data: [] }) } },
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
    await renderWizard();
    expect(a11yState(screen.getByTestId('onboarding-continue'))?.disabled).toBe(true);
  });

  it('selecting a job enables Continue and its label counts (AC1)', async () => {
    await renderWizard();
    await fireEvent.press(screen.getByTestId('onboarding-job-PLAN_MEALS'));
    expect(screen.getByText('Continue — 1 selected')).toBeTruthy();
    expect(a11yState(screen.getByTestId('onboarding-continue'))?.disabled).toBeFalsy();
  });

  it('tapping a selected card deselects it (AC1)', async () => {
    await renderWizard();
    const card = screen.getByTestId('onboarding-job-TRAIN');
    await fireEvent.press(card);
    expect(a11yState(card)?.checked).toBe(true);
    await fireEvent.press(card);
    expect(a11yState(card)?.checked).toBe(false);
  });

  it('Train only hands off straight to gym setup (AC2)', async () => {
    await renderWizard();
    await fireEvent.press(screen.getByTestId('onboarding-job-TRAIN'));
    await fireEvent.press(screen.getByTestId('onboarding-continue'));
    await waitFor(() => expect(mockSetJobsMutateAsync).toHaveBeenCalledWith({ jobs: ['TRAIN'] }));
    expect(mockSetMode).toHaveBeenCalledWith('gym');
    expect(mockReplace).toHaveBeenCalledWith('/today');
    expect(mockPush).toHaveBeenCalledWith('/gym/setup');
  });

  it('"Just looking around" saves PLAN_MEALS and skips to Food Today', async () => {
    await renderWizard();
    await fireEvent.press(screen.getByTestId('onboarding-skip'));
    const [input, opts] = mockSetJobsMutate.mock.calls[0] as [
      { jobs: string[] },
      { onSuccess?: () => void } | undefined,
    ];
    expect(input).toEqual({ jobs: ['PLAN_MEALS'] });
    expect(typeof opts?.onSuccess).toBe('function');
  });
});
