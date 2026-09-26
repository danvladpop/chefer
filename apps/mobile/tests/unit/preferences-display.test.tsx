import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, screen, userEvent } from '@testing-library/react-native';
import PreferencesScreen from '../../app/preferences';
import type { createTrpcPreferencesMock } from './preferences-trpc-mock';
import { mutationResult, queryResult } from './preferences-trpc-mock';

// Backlog P2-6 / audit F-DASH-3-2: units + currency are editable on every
// tier (setDisplayPreferences); the weekly budget stays premium and is typed
// in the user's currency but stored in EUR.
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

const SAFE_AREA_METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 },
};

function renderScreen() {
  return render(
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <PreferencesScreen />
    </SafeAreaProvider>,
  );
}

function withProfile(planTier: 'FREE' | 'PREMIUM') {
  trpc.auth.me.useQuery.mockReturnValue(queryResult({ data: { planTier, role: 'USER' } }));
  trpc.preferences.get.useQuery.mockReturnValue(
    queryResult({
      data: {
        chefProfile: {
          preferredUnits: 'METRIC',
          deliveryCurrency: 'USD',
          weeklyBudgetEur: 55.56,
          goal: null,
        },
        dietaryPreferences: null,
      },
    }),
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  trpc.preferences.updateSafety.useMutation.mockReturnValue(mutationResult());
  trpc.preferences.updateTargets.useMutation.mockReturnValue(mutationResult());
  trpc.preferences.saveProfileBasics.useMutation.mockReturnValue(mutationResult());
  trpc.preferences.setDisplayPreferences.useMutation.mockReturnValue(mutationResult());
});

describe('Preferences — Units & currency (P2-6)', () => {
  it('lets a FREE user switch units and currency', async () => {
    withProfile('FREE');
    const mutate = jest.fn();
    trpc.preferences.setDisplayPreferences.useMutation.mockReturnValue(mutationResult({ mutate }));
    const user = userEvent.setup();
    await renderScreen();

    expect(screen.getByTestId('preferences-display')).toBeOnTheScreen();
    await user.press(screen.getByTestId('prefs-units-IMPERIAL'));
    await user.press(screen.getByTestId('prefs-currency-GBP'));
    await user.press(screen.getByTestId('prefs-save-display'));

    expect(mutate).toHaveBeenCalledWith({ preferredUnits: 'IMPERIAL', currency: 'GBP' });
    // The budget save (premium) is not offered to a free user.
    expect(screen.queryByTestId('prefs-save-extras')).not.toBeOnTheScreen();
  });

  it('shows the budget in the saved currency and stores it in EUR (premium)', async () => {
    withProfile('PREMIUM');
    const mutate = jest.fn();
    trpc.preferences.updateTargets.useMutation.mockReturnValue(mutationResult({ mutate }));
    const user = userEvent.setup();
    await renderScreen();

    expect(screen.getByTestId('prefs-budget')).toHaveDisplayValue('60');
    await user.press(screen.getByTestId('prefs-save-extras'));
    expect(mutate).toHaveBeenCalledWith({ weeklyBudgetEur: 55.56 });
  });
});
