import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { createMemoryKvBackend, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import { OnboardingWizard } from '../../src/features/onboarding/onboarding-wizard';

// WP-03 lane B: UX-ONB-07 — Continue is the keyboard-aware scroll view's sticky
// footer, and a typed-but-not-added household member is added by Continue
// instead of being dropped.

jest.mock('../../src/features/privacy/use-health-consent', () => ({
  useHealthConsent: () => ({
    consented: true,
    requestHealthConsent: (run: () => void) => run(),
    healthConsentSheet: null,
  }),
}));
jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => (() => void) | undefined): void => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't close over top-of-file imports
    (require('react') as typeof import('react')).useEffect(effect, [effect]);
  },
  router: { push: jest.fn(), replace: jest.fn() },
}));
jest.mock('../../src/features/gym/mode-store', () => ({ setMode: jest.fn() }));
jest.mock('../../src/hooks/use-is-premium', () => ({ useIsPremium: () => false }));
jest.mock('../../src/hooks/use-entitlement', () => ({
  useEntitlement: () => ({ limit: null, isPremium: false }),
}));
jest.mock('../../src/features/ai-consent/ai-consent-provider', () => ({
  useAiConsent: () => jest.fn(),
}));
jest.mock('../../src/lib/auth-store', () => ({ getToken: () => 'token-A' }));

const mockAdd = jest.fn();
jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      preferences: { invalidate: jest.fn(), get: { invalidate: jest.fn() } },
      dashboard: { invalidate: jest.fn() },
      household: { list: { invalidate: jest.fn() } },
      mealPlan: { invalidate: jest.fn() },
      shoppingList: { getForWeek: { invalidate: jest.fn() } },
      safety: { getTable: { invalidate: jest.fn() } },
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
          mutateAsync: jest.fn().mockResolvedValue({}),
          isPending: false,
        }),
      },
      updateSafety: {
        useMutation: () => ({ mutateAsync: jest.fn(), mutate: jest.fn(), isPending: false }),
      },
      saveProfileBasics: {
        useMutation: () => ({ mutateAsync: jest.fn(), mutate: jest.fn(), isPending: false }),
      },
      updateTargets: {
        useMutation: () => ({ mutateAsync: jest.fn(), mutate: jest.fn(), isPending: false }),
      },
      setDisplayPreferences: {
        useMutation: () => ({ mutateAsync: jest.fn(), mutate: jest.fn(), isPending: false }),
      },
    },
    household: {
      list: { useQuery: () => ({ data: [], isLoading: false, isError: false }) },
      add: {
        useMutation: () => ({ mutate: mockAdd, isPending: false, error: null }),
      },
      update: { useMutation: () => ({ mutate: jest.fn(), isPending: false, error: null }) },
      remove: { useMutation: () => ({ mutate: jest.fn(), isPending: false, error: null }) },
    },
    safety: { getTable: { useQuery: () => ({ data: undefined }) } },
    training: {
      setDayKinds: {
        useMutation: () => ({ mutateAsync: jest.fn(), mutate: jest.fn(), isPending: false }),
      },
    },
    mealPlan: {
      setShape: {
        useMutation: () => ({ mutateAsync: jest.fn(), mutate: jest.fn(), isPending: false }),
      },
      getShape: { useQuery: () => ({ data: undefined }) },
      generate: {
        useMutation: () => ({ mutateAsync: jest.fn(), mutate: jest.fn(), isPending: false }),
      },
    },
  },
}));

const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

async function goToTableStep() {
  await render(
    <SafeAreaProvider initialMetrics={SAFE_AREA}>
      <OnboardingWizard />
    </SafeAreaProvider>,
  );
  await fireEvent.press(screen.getByTestId('onboarding-job-HOUSEHOLD'));
  await fireEvent.press(screen.getByTestId('onboarding-continue'));
  await waitFor(() => expect(screen.getByTestId('onboarding-title')).toHaveTextContent(/table/));
}

beforeEach(() => {
  jest.clearAllMocks();
  // The wizard drafts its answers to KV: a fresh store per test.
  setKvBackendForTests(createMemoryKvBackend());
});

describe('onboarding wizard keyboard handling (UX-ONB-07)', () => {
  it('scrolls in a keyboard-aware view whose footer keeps taps on the first press', async () => {
    await render(
      <SafeAreaProvider initialMetrics={SAFE_AREA}>
        <OnboardingWizard />
      </SafeAreaProvider>,
    );
    expect(screen.getByTestId('onboarding-scroll').props.keyboardShouldPersistTaps).toBe('handled');
    // Continue sits in the pinned persist-taps footer (a non-scrolling ScrollView).
    let node = screen.getByTestId('onboarding-continue').parent;
    while (node && node.props.scrollEnabled !== false) node = node.parent;
    expect(node?.props.keyboardShouldPersistTaps).toBe('handled');
  });

  it('Continue adds a typed but not-added household member, then moves on', async () => {
    await goToTableStep();
    await fireEvent.changeText(screen.getByTestId('household-name'), 'Mia');
    await fireEvent.press(screen.getByTestId('onboarding-continue'));

    // Added through the normal save, with the typed name…
    expect(mockAdd).toHaveBeenCalledTimes(1);
    const [payload, options] = mockAdd.mock.calls[0] as [
      { name: string },
      { onSuccess: () => void },
    ];
    expect(payload.name).toBe('Mia');
    // …and the wizard waits for it: still on the table step until the save lands.
    expect(screen.getByTestId('onboarding-title')).toHaveTextContent(/table/);
    await act(() => {
      options.onSuccess();
    });
    await waitFor(() =>
      expect(screen.getByTestId('onboarding-title')).not.toHaveTextContent(/table/),
    );
  });

  it('Continue with nothing typed just moves on, adding nobody', async () => {
    await goToTableStep();
    await fireEvent.press(screen.getByTestId('onboarding-continue'));
    expect(mockAdd).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByTestId('onboarding-title')).not.toHaveTextContent(/table/),
    );
  });
});
