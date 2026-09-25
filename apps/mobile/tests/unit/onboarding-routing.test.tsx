import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import LoginScreen from '../../app/(auth)/login';
import RegisterScreen from '../../app/(auth)/register';
import { OnboardingWizard } from '../../src/features/onboarding/onboarding-wizard';
import type { createTrpcOnboardingMock } from './onboarding-trpc-mock';
import { mutationResult, queryResult } from './onboarding-trpc-mock';

// Dogfood feedback #9: register routes new accounts into onboarding, login
// never does, and Skip (or Finish) always lands on the Food dashboard.
//
// Both screens transitively import `../../src/lib/trpc` before this file's
// own mock import would run, so the factory has to `require()` lazily — same
// reasoning as gym-setup.test.tsx.
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
});

describe('Register → onboarding', () => {
  it('routes a newly registered account to /onboarding', async () => {
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
    await user.press(screen.getByTestId('register-submit'));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/onboarding'));
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

describe('OnboardingWizard — Skip lands on the Food dashboard', () => {
  beforeEach(() => {
    trpc.preferences.updateSafety.useMutation.mockReturnValue(mutationResult());
    trpc.preferences.saveProfileBasics.useMutation.mockReturnValue(mutationResult());
    trpc.preferences.setup.useMutation.mockReturnValue(mutationResult());
  });

  it('free tier: Skip saves nothing (no fields filled) and lands on /(food)', async () => {
    trpc.auth.me.useQuery.mockReturnValue(
      queryResult({ data: { planTier: 'FREE', role: 'USER' } }),
    );
    const safetyMutateAsync = jest.fn(() => Promise.resolve(undefined));
    const basicsMutateAsync = jest.fn(() => Promise.resolve(undefined));
    trpc.preferences.updateSafety.useMutation.mockReturnValue(
      mutationResult({ mutateAsync: safetyMutateAsync }),
    );
    trpc.preferences.saveProfileBasics.useMutation.mockReturnValue(
      mutationResult({ mutateAsync: basicsMutateAsync }),
    );
    const user = userEvent.setup();
    await renderWithSafeArea(<OnboardingWizard />);

    await user.press(screen.getByTestId('onboarding-skip'));

    await waitFor(() =>
      expect(safetyMutateAsync).toHaveBeenCalledWith({
        dietaryRestrictions: [],
        allergies: [],
        dislikedIngredients: [],
      }),
    );
    // No goal/metrics were filled in, so saveProfileBasics is never called.
    expect(basicsMutateAsync).not.toHaveBeenCalled();
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/(food)'));
  });

  it('free tier: Skip keeps allergies that were already saved (F-ONB-1-1)', async () => {
    trpc.auth.me.useQuery.mockReturnValue(
      queryResult({ data: { planTier: 'FREE', role: 'USER' } }),
    );
    trpc.preferences.get.useQuery.mockReturnValue(
      queryResult({
        data: {
          chefProfile: null,
          dietaryPreferences: {
            dietaryRestrictions: ['Vegetarian'],
            allergies: ['Peanuts', 'Shellfish'],
            dislikedIngredients: [],
            cuisinePreferences: [],
            mealsPerDay: 3,
            servingSize: 1,
          },
        },
      }),
    );
    const safetyMutateAsync = jest.fn(() => Promise.resolve(undefined));
    trpc.preferences.updateSafety.useMutation.mockReturnValue(
      mutationResult({ mutateAsync: safetyMutateAsync }),
    );
    const user = userEvent.setup();
    await renderWithSafeArea(<OnboardingWizard />);

    await user.press(screen.getByTestId('onboarding-skip'));

    await waitFor(() =>
      expect(safetyMutateAsync).toHaveBeenCalledWith({
        dietaryRestrictions: ['Vegetarian'],
        allergies: ['Peanuts', 'Shellfish'],
        dislikedIngredients: [],
      }),
    );
    trpc.preferences.get.useQuery.mockReturnValue(queryResult());
  });

  it('premium tier: Skip abandons the wizard without saving (setup is all-or-nothing)', async () => {
    trpc.auth.me.useQuery.mockReturnValue(
      queryResult({ data: { planTier: 'PREMIUM', role: 'USER' } }),
    );
    const setupMutateAsync = jest.fn(() => Promise.resolve(undefined));
    trpc.preferences.setup.useMutation.mockReturnValue(
      mutationResult({ mutateAsync: setupMutateAsync }),
    );
    const user = userEvent.setup();
    await renderWithSafeArea(<OnboardingWizard />);

    await user.press(screen.getByTestId('onboarding-skip'));

    expect(setupMutateAsync).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith('/(food)');
  });
});
