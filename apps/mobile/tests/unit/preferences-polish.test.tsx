import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, render, screen, userEvent } from '@testing-library/react-native';
import PreferencesScreen from '../../app/preferences';
import type { createTrpcPreferencesMock } from './preferences-trpc-mock';
import { mutationResult, queryResult } from './preferences-trpc-mock';

// WP-09 lane B: UX-ACC-21 (Goal & body save refreshes targets + dashboard) and
// UX-ACC-23 (weekly budget validation + visible cap).
jest.mock('../../src/features/privacy/use-health-consent', () => ({
  useHealthConsent: () => ({
    consented: true,
    requestHealthConsent: (run: () => void) => run(),
    healthConsentSheet: null,
  }),
}));
jest.mock('../../src/lib/trpc', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- factory runs before imports resolve
  const mock = require('./preferences-trpc-mock') as typeof import('./preferences-trpc-mock');
  return mock.createTrpcPreferencesMock();
});
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
}));

const { trpc } =
  jest.requireMock<ReturnType<typeof createTrpcPreferencesMock>>('../../src/lib/trpc');

function renderScreen() {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
        frame: { x: 0, y: 0, width: 390, height: 844 },
      }}
    >
      <PreferencesScreen />
    </SafeAreaProvider>,
  );
}

const utilsFake = {
  preferences: { get: { invalidate: jest.fn() }, invalidate: jest.fn() },
  gym: { invalidate: jest.fn() },
  mealPlan: { invalidate: jest.fn() },
  dashboard: { invalidate: jest.fn(), summary: { invalidate: jest.fn() } },
  targets: {
    invalidate: jest.fn(),
    get: { invalidate: jest.fn() },
    changes: { invalidate: jest.fn() },
  },
  user: { me: { setData: jest.fn(), invalidate: jest.fn() } },
  tracker: { getDay: { invalidate: jest.fn() } },
};

beforeEach(() => {
  jest.clearAllMocks();
  trpc.useUtils.mockReturnValue(utilsFake);
  trpc.auth.me.useQuery.mockReturnValue(
    queryResult({ data: { planTier: 'PREMIUM', role: 'USER' } }),
  );
  trpc.preferences.get.useQuery.mockReturnValue(
    queryResult({
      data: {
        chefProfile: {
          preferredUnits: 'METRIC',
          deliveryCurrency: 'EUR',
          weeklyBudgetEur: 60,
          goal: null,
        },
        dietaryPreferences: null,
      },
    }),
  );
  trpc.preferences.updateSafety.useMutation.mockReturnValue(mutationResult());
  trpc.preferences.updateTargets.useMutation.mockReturnValue(mutationResult());
  trpc.preferences.saveProfileBasics.useMutation.mockReturnValue(mutationResult());
  trpc.preferences.setDisplayPreferences.useMutation.mockReturnValue(mutationResult());
});

describe('Goal & body save (UX-ACC-21)', () => {
  it('refreshes the targets and the dashboard, not only the preferences', async () => {
    let onSuccess: (() => void) | undefined;
    trpc.preferences.saveProfileBasics.useMutation.mockImplementation(
      (opts: { onSuccess?: () => void }) => {
        onSuccess = opts.onSuccess;
        return mutationResult();
      },
    );
    await renderScreen();

    await act(() => {
      onSuccess?.();
    });

    expect(utilsFake.targets.invalidate).toHaveBeenCalled();
    expect(utilsFake.dashboard.invalidate).toHaveBeenCalled();
    expect(utilsFake.preferences.get.invalidate).toHaveBeenCalled();
  });
});

describe('Weekly budget (UX-ACC-23)', () => {
  it('shows the cap under the field', async () => {
    await renderScreen();
    expect(screen.getByTestId('prefs-budget-cap')).toHaveTextContent(/Up to €2000 a week/);
  });

  it('refuses "abc": an inline error, nothing is saved, the saved budget is kept', async () => {
    const mutate = jest.fn();
    trpc.preferences.updateTargets.useMutation.mockReturnValue(mutationResult({ mutate }));
    const user = userEvent.setup();
    await renderScreen();

    await user.clear(screen.getByTestId('prefs-budget'));
    await user.type(screen.getByTestId('prefs-budget'), 'abc');
    await user.press(screen.getByTestId('prefs-save-extras'));

    expect(screen.getByTestId('prefs-budget-error')).toHaveTextContent(/as a number/);
    expect(mutate).not.toHaveBeenCalled();
  });

  it('refuses 5000 instead of storing it as 2000', async () => {
    const mutate = jest.fn();
    trpc.preferences.updateTargets.useMutation.mockReturnValue(mutationResult({ mutate }));
    const user = userEvent.setup();
    await renderScreen();

    await user.clear(screen.getByTestId('prefs-budget'));
    await user.type(screen.getByTestId('prefs-budget'), '5000');
    await user.press(screen.getByTestId('prefs-save-extras'));

    expect(screen.getByTestId('prefs-budget-error')).toHaveTextContent(/most you can set is €2000/);
    expect(mutate).not.toHaveBeenCalled();
  });

  it('saves a valid amount, and a blank field removes the budget on purpose', async () => {
    const mutate = jest.fn();
    trpc.preferences.updateTargets.useMutation.mockReturnValue(mutationResult({ mutate }));
    const user = userEvent.setup();
    await renderScreen();

    await user.clear(screen.getByTestId('prefs-budget'));
    await user.type(screen.getByTestId('prefs-budget'), '75');
    await user.press(screen.getByTestId('prefs-save-extras'));
    expect(mutate).toHaveBeenLastCalledWith({ weeklyBudgetEur: 75 });

    await user.clear(screen.getByTestId('prefs-budget'));
    await user.press(screen.getByTestId('prefs-save-extras'));
    expect(mutate).toHaveBeenLastCalledWith({ weeklyBudgetEur: null });
  });

  it('drops the error as soon as the field is edited', async () => {
    const user = userEvent.setup();
    await renderScreen();
    await user.clear(screen.getByTestId('prefs-budget'));
    await user.type(screen.getByTestId('prefs-budget'), 'abc');
    await user.press(screen.getByTestId('prefs-save-extras'));
    expect(screen.getByTestId('prefs-budget-error')).toBeOnTheScreen();

    await user.type(screen.getByTestId('prefs-budget'), '1');

    expect(screen.queryByTestId('prefs-budget-error')).toBeNull();
  });
});
