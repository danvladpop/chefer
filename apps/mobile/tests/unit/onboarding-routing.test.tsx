import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import LoginScreen from '../../app/(auth)/login';
import RegisterScreen from '../../app/(auth)/register';
import {
  clearPendingOnboarding,
  isOnboardingPending,
} from '../../src/features/auth/pending-onboarding';
import { clearRegisterDraft } from '../../src/features/auth/register-draft';
import { OnboardingWizard } from '../../src/features/onboarding/onboarding-wizard';
import type { createTrpcOnboardingMock } from './onboarding-trpc-mock';
import { mutationResult, queryResult } from './onboarding-trpc-mock';

// Dogfood feedback #9: register routes new accounts into onboarding, login
// never does, and Skip (or Finish) always lands on the Food dashboard.
//
// Both screens transitively import `../../src/lib/trpc` before this file's
// own mock import would run, so the factory has to `require()` lazily — same
// reasoning as gym-setup.test.tsx.
// T-26.2: these tests are about the save itself — the health-consent guard is
// covered in health-consent.test.tsx, so here consent is always on record.
jest.mock('../../src/features/privacy/use-health-consent', () => ({
  useHealthConsent: () => ({
    consented: true,
    requestHealthConsent: (run: () => void) => run(),
    healthConsentSheet: null,
  }),
}));

jest.mock('../../src/lib/trpc', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- see comment above
  const mock = require('./onboarding-trpc-mock') as typeof import('./onboarding-trpc-mock');
  return mock.createTrpcOnboardingMock();
});
jest.mock('expo-router', () => {
  // jest.mock factories can't reference out-of-scope imports (babel-plugin-
  // jest-hoist), so React/RN come from a lazy require instead of a
  // top-of-file import.
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- see comment above
  const { createElement } = require('react') as typeof import('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- see comment above
  const { Pressable } = require('react-native') as typeof import('react-native');
  return {
    router: { replace: jest.fn(), push: jest.fn(), back: jest.fn() },
    Link: ({ children, testID }: { children: React.ReactNode; testID?: string }) =>
      createElement(Pressable, { testID }, children),
  };
});
jest.mock('../../src/lib/auth-store', () => ({
  setToken: jest.fn(() => Promise.resolve(undefined)),
  getToken: jest.fn(() => null),
  subscribe: jest.fn(() => () => undefined),
  loadToken: jest.fn(() => Promise.resolve(null)),
  hasSignedInBefore: jest.fn(() => true),
  loadHasSignedInBefore: jest.fn(() => Promise.resolve(true)),
}));
jest.mock('../../src/features/gym/mode-store', () => ({ setMode: jest.fn() }));
// The onboarding wizard's first-week generation is AI-consent-gated
// (Rule 3) — these routing tests aren't exercising that flow, so the hook
// is stubbed rather than requiring a full <AiConsentProvider> tree.
jest.mock('../../src/features/ai-consent/ai-consent-provider', () => ({
  useAiConsent: () => jest.fn(),
}));

const { trpc } =
  jest.requireMock<ReturnType<typeof createTrpcOnboardingMock>>('../../src/lib/trpc');
const { router } = jest.requireMock<{
  router: { replace: jest.Mock; push: jest.Mock; back: jest.Mock };
}>('expo-router');

const SAFE_AREA_METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 },
};

function renderWithSafeArea(ui: React.ReactElement) {
  return render(<SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>{ui}</SafeAreaProvider>);
}

beforeEach(() => {
  jest.clearAllMocks();
  // T-39.1: `register-draft.ts` is a deliberately module-scoped cache (so the
  // in-app legal screen round trip keeps the form's values) — clear it so
  // one test's typed values never leak into the next screen's mount.
  clearRegisterDraft();
  clearPendingOnboarding();
});

describe('Register → onboarding', () => {
  // R-18b: the redirect is state (read by the Food tab layout on the guard
  // flip), not an imperative router.replace racing the awaited token writes.
  it('flags a newly registered account for onboarding before the token is stored', async () => {
    let onSuccess: ((data: { session: { token: string } | null }) => void) | undefined;
    const mutate = jest.fn(() => {
      onSuccess?.({ session: { token: 'tok' } });
    });
    trpc.auth.register.useMutation.mockImplementation((opts: { onSuccess: typeof onSuccess }) => {
      onSuccess = opts.onSuccess;
      return mutationResult({ mutate });
    });
    const user = userEvent.setup();
    await renderWithSafeArea(<RegisterScreen />);

    await user.type(screen.getByTestId('register-email'), 'new@e2e.chefer.dev');
    await user.type(screen.getByTestId('register-password'), 'Password123!');
    await user.type(screen.getByTestId('register-confirm-password'), 'Password123!');
    // T-39.1 / T-26.5: both consent boxes are required before the API is called.
    await user.press(screen.getByTestId('register-accept-terms'));
    await user.press(screen.getByTestId('register-age-confirm'));
    await user.press(screen.getByTestId('register-submit'));

    await waitFor(() => expect(isOnboardingPending()).toBe(true));
    const { setToken } = jest.requireMock<{ setToken: jest.Mock }>('../../src/lib/auth-store');
    expect(setToken).toHaveBeenCalledWith('tok');
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('does not raise the flag when sign-up returns no session', async () => {
    let onSuccess: ((data: { session: { token: string } | null }) => void) | undefined;
    const mutate = jest.fn(() => {
      onSuccess?.({ session: null });
    });
    trpc.auth.register.useMutation.mockImplementation((opts: { onSuccess: typeof onSuccess }) => {
      onSuccess = opts.onSuccess;
      return mutationResult({ mutate });
    });
    const user = userEvent.setup();
    await renderWithSafeArea(<RegisterScreen />);
    await user.type(screen.getByTestId('register-email'), 'new@e2e.chefer.dev');
    await user.type(screen.getByTestId('register-password'), 'Password123!');
    await user.type(screen.getByTestId('register-confirm-password'), 'Password123!');
    await user.press(screen.getByTestId('register-accept-terms'));
    await user.press(screen.getByTestId('register-age-confirm'));
    await user.press(screen.getByTestId('register-submit'));

    await waitFor(() => expect(mutate).toHaveBeenCalled());
    expect(isOnboardingPending()).toBe(false);
  });
});

describe('Login → no onboarding', () => {
  it('does not navigate to onboarding after signing in', async () => {
    let onSuccess: ((data: { session: { token: string } | null }) => void) | undefined;
    const mutate = jest.fn(() => {
      onSuccess?.({ session: { token: 'tok' } });
    });
    trpc.auth.login.useMutation.mockImplementation((opts: { onSuccess: typeof onSuccess }) => {
      onSuccess = opts.onSuccess;
      return mutationResult({ mutate });
    });
    const user = userEvent.setup();
    await renderWithSafeArea(<LoginScreen />);

    await user.type(screen.getByTestId('login-email'), 'alice@chefer.dev');
    await user.type(screen.getByTestId('login-password'), 'User@123!');
    await user.press(screen.getByTestId('login-submit'));

    // setToken alone flips the root layout's auth guard — sign-in never
    // pushes/replaces to a route, and certainly never to onboarding.
    await waitFor(() => expect(mutate).toHaveBeenCalled());
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });
});

describe('OnboardingWizard — "Just looking around" lands on the Food dashboard', () => {
  beforeEach(() => {
    trpc.auth.me.useQuery.mockReturnValue(
      queryResult({ data: { planTier: 'FREE', role: 'USER' } }),
    );
    trpc.preferences.get.useQuery.mockReturnValue(
      queryResult({ data: { chefProfile: null, dietaryPreferences: null, jobs: [] } }),
    );
  });

  it('saves jobs: [PLAN_MEALS] and lands on /(food) (UX-03 copy)', async () => {
    const setJobsMutate = jest.fn();
    trpc.preferences.setJobs.useMutation.mockReturnValue(mutationResult({ mutate: setJobsMutate }));
    const user = userEvent.setup();
    await renderWithSafeArea(<OnboardingWizard />);

    await user.press(screen.getByTestId('onboarding-skip'));

    const [input, opts] = setJobsMutate.mock.calls[0] as [
      { jobs: string[] },
      { onSuccess?: () => void } | undefined,
    ];
    expect(input).toEqual({ jobs: ['PLAN_MEALS'] });
    expect(typeof opts?.onSuccess).toBe('function');
  });
});

describe('OnboardingWizard — jobs step (UX-03, T-03.2/T-03.3)', () => {
  beforeEach(() => {
    trpc.auth.me.useQuery.mockReturnValue(
      queryResult({ data: { planTier: 'FREE', role: 'USER' } }),
    );
    trpc.preferences.get.useQuery.mockReturnValue(
      queryResult({ data: { chefProfile: null, dietaryPreferences: null, jobs: [] } }),
    );
    trpc.preferences.updateSafety.useMutation.mockReturnValue(mutationResult());
    trpc.preferences.saveProfileBasics.useMutation.mockReturnValue(mutationResult());
  });

  it('asks the jobs question first (AC1)', async () => {
    await renderWithSafeArea(<OnboardingWizard />);
    expect(screen.getByTestId('onboarding-title').props.children).toBe(
      'What should Chefer help with?',
    );
    // No total until jobs are known — the counter never grows.
    expect(screen.getByText('Getting started')).toBeTruthy();
  });

  it('Feed my household adds "Who\'s at your table?" before the food steps (AC4)', async () => {
    const setJobsMutateAsync = jest.fn(() =>
      Promise.resolve({ jobs: ['HOUSEHOLD'], intent: 'HOUSEHOLD' }),
    );
    trpc.preferences.setJobs.useMutation.mockReturnValue(
      mutationResult({ mutateAsync: setJobsMutateAsync }),
    );
    const user = userEvent.setup();
    await renderWithSafeArea(<OnboardingWizard />);

    await user.press(screen.getByTestId('onboarding-job-HOUSEHOLD'));
    expect(screen.getByText('Getting started')).toBeTruthy();
    await user.press(screen.getByTestId('onboarding-continue'));

    await waitFor(() =>
      expect(screen.getByTestId('onboarding-title').props.children).toBe('Who’s at your table?'),
    );
    expect(setJobsMutateAsync).toHaveBeenCalledWith({ jobs: ['HOUSEHOLD'] });
    expect(screen.getByTestId('household-add')).toBeTruthy();
  });

  it('Train only goes straight to Gym setup — no food wizard first (AC2)', async () => {
    const setJobsMutateAsync = jest.fn(() => Promise.resolve({ jobs: ['TRAIN'], intent: 'TRAIN' }));
    trpc.preferences.setJobs.useMutation.mockReturnValue(
      mutationResult({ mutateAsync: setJobsMutateAsync }),
    );
    const { setMode } = jest.requireMock<{ setMode: jest.Mock }>(
      '../../src/features/gym/mode-store',
    );
    const user = userEvent.setup();
    await renderWithSafeArea(<OnboardingWizard />);

    await user.press(screen.getByTestId('onboarding-job-TRAIN'));
    await user.press(screen.getByTestId('onboarding-continue'));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/gym/setup'));
    expect(setJobsMutateAsync).toHaveBeenCalledWith({ jobs: ['TRAIN'] });
    expect(setMode).toHaveBeenCalledWith('gym');
    expect(router.replace).toHaveBeenCalledWith('/today');
  });
});
