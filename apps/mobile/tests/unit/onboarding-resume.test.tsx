import { BackHandler } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { createMemoryKvBackend, kv, setKvBackendForTests } from '../../src/features/gym/offline/kv';
import {
  ONBOARDING_DRAFT_KEY,
  readOnboardingDraft,
} from '../../src/features/onboarding/onboarding-draft';
import { OnboardingWizard } from '../../src/features/onboarding/onboarding-wizard';

// UX-ONB-01 (BACK steps back; the setup survives a kill), UX-ONB-08 (saved
// answers pre-fill, steps follow the current answers, floats are rounded) and
// the onboarding half of UX-ACC-01 / UX-ACC-02.

jest.mock('../../src/features/privacy/use-health-consent', () => ({
  useHealthConsent: () => ({
    consented: true,
    requestHealthConsent: (run: () => void) => run(),
    healthConsentSheet: null,
  }),
}));
jest.mock('expo-router', () => ({
  // The screen is always focused here, so the BACK-handler effect runs on mount.
  useFocusEffect: (effect: () => (() => void) | undefined): void => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't close over top-of-file imports
    (require('react') as typeof import('react')).useEffect(effect, [effect]);
  },
  router: { push: jest.fn(), replace: jest.fn() },
}));
jest.mock('../../src/features/gym/mode-store', () => ({ setMode: jest.fn() }));
jest.mock('../../src/hooks/use-is-premium', () => ({ useIsPremium: () => false }));
jest.mock('../../src/features/ai-consent/ai-consent-provider', () => ({
  useAiConsent: () => jest.fn(),
}));

let mockToken: string | null = 'token-A';
jest.mock('../../src/lib/auth-store', () => ({ getToken: () => mockToken }));

type SavedPrefs = {
  chefProfile: Record<string, unknown> | null;
  dietaryPreferences: Record<string, unknown> | null;
  jobs: string[];
};
const NOTHING_SAVED: SavedPrefs = { chefProfile: null, dietaryPreferences: null, jobs: [] };
let mockSaved: SavedPrefs = NOTHING_SAVED;

const mockSetJobsMutate = jest.fn();
const mockSetJobsMutateAsync = jest.fn().mockResolvedValue({ jobs: ['PLAN_MEALS'], intent: null });
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
          data: mockSaved,
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
    training: { setDayKinds: { useMutation: () => ({ mutateAsync: jest.fn() }) } },
    household: { list: { useQuery: () => ({ data: [] }) } },
    mealPlan: {
      setShape: { useMutation: () => ({ mutateAsync: jest.fn(), isPending: false }) },
      getShape: { useQuery: () => ({ data: undefined }) },
      generate: { useMutation: () => ({ mutate: jest.fn() }) },
    },
  },
}));

const { router } = jest.requireMock<{ router: { replace: jest.Mock; push: jest.Mock } }>(
  'expo-router',
);

const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};
function wizard() {
  return (
    <SafeAreaProvider initialMetrics={SAFE_AREA}>
      <OnboardingWizard />
    </SafeAreaProvider>
  );
}

// The hardware BACK handlers the wizard registered; the last one is the live one.
type BackHandlerFn = Parameters<typeof BackHandler.addEventListener>[1];
const backHandlers: BackHandlerFn[] = [];
async function pressHardwareBack(): Promise<boolean> {
  let handled = false;
  await act(() => {
    handled =
      backHandlers[backHandlers.length - 1]?.({ type: 'hardwareBackPress', timeStamp: 0 }) ?? false;
  });
  return handled;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockToken = 'token-A';
  mockSaved = NOTHING_SAVED;
  setKvBackendForTests(createMemoryKvBackend());
  backHandlers.length = 0;
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
    backHandlers.push(handler);
    return {
      remove: () => {
        const at = backHandlers.indexOf(handler);
        if (at >= 0) backHandlers.splice(at, 1);
      },
    };
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

async function goToDietStep() {
  await fireEvent.press(screen.getByTestId('onboarding-job-PLAN_MEALS'));
  await fireEvent.press(screen.getByTestId('onboarding-continue'));
  await waitFor(() => expect(screen.getByTestId('onboarding-title')).toHaveTextContent(/Diet/));
}

describe('Android BACK in the wizard (UX-ONB-01)', () => {
  it('steps back one question instead of closing the app', async () => {
    await render(wizard());
    await goToDietStep();

    expect(await pressHardwareBack()).toBe(true);
    await waitFor(() =>
      expect(screen.getByTestId('onboarding-title')).toHaveTextContent(/help with/i),
    );
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('on the first step asks before leaving, and stays put on "Keep going"', async () => {
    await render(wizard());

    expect(await pressHardwareBack()).toBe(true);
    expect(await screen.findByTestId('onboarding-leave-confirm-body')).toBeOnTheScreen();
    expect(router.replace).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('onboarding-leave-confirm-cancel'));
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('"Leave for now" goes to Today and keeps the draft, so the next launch resumes', async () => {
    await render(wizard());
    await fireEvent.press(screen.getByTestId('onboarding-job-PLAN_MEALS'));
    expect(readOnboardingDraft('token-A')).not.toBeNull();

    await pressHardwareBack();
    await fireEvent.press(await screen.findByTestId('onboarding-leave-confirm-confirm'));
    expect(router.replace).toHaveBeenCalledWith('/(food)');
    expect(readOnboardingDraft('token-A')?.jobs).toEqual(['PLAN_MEALS']);
  });

  it('the header back arrow behaves the same way', async () => {
    await render(wizard());
    await goToDietStep();
    await fireEvent.press(screen.getByTestId('onboarding-back'));
    await waitFor(() =>
      expect(screen.getByTestId('onboarding-title')).toHaveTextContent(/help with/i),
    );
  });
});

describe('the wizard survives a kill (UX-ONB-01)', () => {
  it('resumes at the same question with the same answers after a restart', async () => {
    const first = await render(wizard());
    await goToDietStep();
    await fireEvent.press(screen.getByText('Peanuts'));
    await first.unmount();

    // A new process: nothing in memory, the same session token, the KV on disk.
    await render(wizard());
    expect(screen.getByTestId('onboarding-title')).toHaveTextContent(/Diet/);
    expect(readOnboardingDraft('token-A')?.safety?.allergies).toEqual(['Peanuts']);
    // Peanuts is still ticked: the read-back lists it.
    expect(screen.getByTestId('onb-allergies-readback')).toHaveTextContent(/Peanuts/);
  });

  it('never resumes another session’s answers (sign-out, then a new account)', async () => {
    const first = await render(wizard());
    await goToDietStep();
    await fireEvent.press(screen.getByText('Peanuts'));
    await first.unmount();

    mockToken = 'token-B';
    await render(wizard());
    // Back at the first question, nothing selected, nothing of A on screen.
    expect(screen.getByTestId('onboarding-title')).toHaveTextContent(/help with/i);
    expect(screen.getByTestId('onboarding-continue')).toBeDisabled();
    expect(readOnboardingDraft('token-A')).toBeNull();
  });

  it('forgets the draft once the setup is skipped', async () => {
    await render(wizard());
    await fireEvent.press(screen.getByTestId('onboarding-job-PLAN_MEALS'));
    expect(kv.getString(ONBOARDING_DRAFT_KEY)).not.toBeNull();

    await fireEvent.press(screen.getByTestId('onboarding-skip'));
    const [, options] = mockSetJobsMutate.mock.calls[0] as [unknown, { onSuccess: () => void }];
    await act(() => options.onSuccess());
    expect(kv.getString(ONBOARDING_DRAFT_KEY)).toBeNull();
  });

  it('does not leave a draft behind when re-opening a finished setup', async () => {
    mockSaved = { ...NOTHING_SAVED, jobs: ['PLAN_MEALS'] };
    await render(wizard());
    await fireEvent.press(screen.getByTestId('onboarding-job-HOUSEHOLD'));
    expect(kv.getString(ONBOARDING_DRAFT_KEY)).toBeNull();
  });
});

describe('hydration from what is saved (UX-ONB-08, UX-ACC-02)', () => {
  it('pre-fills the saved jobs and builds the steps from them', async () => {
    mockSaved = { ...NOTHING_SAVED, jobs: ['PLAN_MEALS', 'TRACK'] };
    await render(wizard());
    expect(screen.getByTestId('onboarding-job-PLAN_MEALS')).toBeChecked();
    expect(screen.getByTestId('onboarding-job-TRACK')).toBeChecked();
    expect(screen.getByText('Continue — 2 selected')).toBeOnTheScreen();
  });

  it('steps follow the CURRENT selection, not the saved jobs', async () => {
    mockSaved = { ...NOTHING_SAVED, jobs: ['TRAIN'] };
    await render(wizard());
    // Saved: Train only (a chain with no food steps). Adding Plan meals now
    // has to lead to the Train + food chain (training days next) — the old code kept using the saved jobs.
    await fireEvent.press(screen.getByTestId('onboarding-job-PLAN_MEALS'));
    await fireEvent.press(screen.getByTestId('onboarding-continue'));
    await waitFor(() =>
      expect(screen.getByTestId('onboarding-title')).toHaveTextContent(/Which days/),
    );
  });

  it('shows saved body metrics rounded to one decimal', async () => {
    mockSaved = {
      chefProfile: { heightCm: 180.0000001, weightKg: 86.1825503, trainingWeekdays: [] },
      dietaryPreferences: null,
      jobs: ['PLAN_MEALS'],
    };
    await render(wizard());
    // Jobs → Diet → How you cook → Goal → Metrics.
    for (let i = 0; i < 4; i++) {
      await fireEvent.press(screen.getByTestId('onboarding-continue'));
      await screen.findByTestId('onboarding-title');
    }
    await waitFor(() => expect(screen.getByTestId('onboarding-title')).toHaveTextContent(/Body/));
    expect(screen.getByDisplayValue('86.2')).toBeOnTheScreen();
    expect(screen.getByDisplayValue('180')).toBeOnTheScreen();
    expect(screen.queryByDisplayValue('86.1825503')).toBeNull();
  });
});

describe('Diet step — a typed-but-unadded term (UX-ACC-01)', () => {
  it('Continue adds "sesame" before leaving the step', async () => {
    await render(wizard());
    await goToDietStep();
    await fireEvent.changeText(screen.getByTestId('onb-something-else-input'), 'sesame');
    await fireEvent.press(screen.getByTestId('onboarding-continue'));

    await waitFor(() => expect(screen.getByTestId('onboarding-title')).toHaveTextContent(/cook/i));
    expect(readOnboardingDraft('token-A')?.safety?.allergies).toContain('Sesame');
  });

  it('Continue stays on the step while an unrecognised term needs a choice', async () => {
    await render(wizard());
    await goToDietStep();
    await fireEvent.changeText(screen.getByTestId('onb-something-else-input'), 'zzqqxx');
    await fireEvent.press(screen.getByTestId('onboarding-continue'));

    expect(screen.getByTestId('onboarding-title')).toHaveTextContent(/Diet/);
    expect(screen.getByTestId('onb-save-blocked')).toHaveTextContent(/zzqqxx/);
  });
});
