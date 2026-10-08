import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import PreferencesScreen from '../../app/preferences';
import type { createTrpcPreferencesMock } from './preferences-trpc-mock';
import { mutationResult, queryResult } from './preferences-trpc-mock';

// Backlog P2-6 / audit F-DASH-3-2: units + currency are editable on every
// tier (setDisplayPreferences); the weekly budget stays premium and is typed
// in the user's currency but stored in EUR.
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
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- factory runs before imports resolve
  const mock = require('./preferences-trpc-mock') as typeof import('./preferences-trpc-mock');
  return mock.createTrpcPreferencesMock();
});
let mockSearchParams: { section?: string } = {};
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockSearchParams,
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
  mockSearchParams = {};
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

  // Bug B-38: "Saved ✓" used to stick regardless of unsaved changes.
  it('bug B-38: reverts "Saved ✓" back to "Save units & currency" after a further edit', async () => {
    withProfile('FREE');
    trpc.preferences.setDisplayPreferences.useMutation.mockReturnValue(
      mutationResult({ isSuccess: true }),
    );
    const user = userEvent.setup();
    await renderScreen();

    expect(screen.getByTestId('prefs-save-display')).toHaveTextContent('Saved ✓');

    await user.press(screen.getByTestId('prefs-units-IMPERIAL'));

    expect(screen.getByTestId('prefs-save-display')).toHaveTextContent('Save units & currency');
  });

  it('bug B-38: safety preferences also revert once an allergy is added', async () => {
    withProfile('FREE');
    trpc.preferences.updateSafety.useMutation.mockReturnValue(mutationResult({ isSuccess: true }));
    const user = userEvent.setup();
    await renderScreen();

    expect(screen.getByTestId('prefs-save-safety')).toHaveTextContent('Saved ✓');

    // The taxonomy SafetyPicker (T-01.7) replaced the free-text allergy field.
    await user.press(screen.getByText('Tree nuts'));

    expect(screen.getByTestId('prefs-save-safety')).toHaveTextContent('Save safety preferences');
  });

  it('bug B-38: budget also reverts once the typed amount changes', async () => {
    withProfile('PREMIUM');
    trpc.preferences.updateTargets.useMutation.mockReturnValue(mutationResult({ isSuccess: true }));
    const user = userEvent.setup();
    await renderScreen();

    expect(screen.getByTestId('prefs-save-extras')).toHaveTextContent('Saved ✓');

    await user.clear(screen.getByTestId('prefs-budget'));
    await user.type(screen.getByTestId('prefs-budget'), '80');

    expect(screen.getByTestId('prefs-save-extras')).toHaveTextContent('Save budget');
  });
});

describe('Show calories and macros on Today (T-04.5)', () => {
  it('defaults on for a goal-having user and saves the explicit override', async () => {
    withProfile('FREE');
    trpc.preferences.get.useQuery.mockReturnValue(
      queryResult({
        data: {
          chefProfile: {
            preferredUnits: 'METRIC',
            deliveryCurrency: 'USD',
            weeklyBudgetEur: null,
            goal: 'LOSE_WEIGHT',
            showNutritionOnToday: null,
          },
          dietaryPreferences: null,
        },
      }),
    );
    const mutate = jest.fn();
    trpc.preferences.setHomeDisplay.useMutation.mockReturnValue(
      mutationResult({ mutate, isPending: false }),
    );
    await renderScreen();

    const toggle = screen.getByTestId('prefs-home-display-switch');
    expect(toggle.props.value).toBe(true);
    await fireEvent(toggle, 'valueChange', false);
    expect(mutate).toHaveBeenCalledWith({ showNutritionOnToday: false });
  });

  it('defaults off for a goal-less user', async () => {
    withProfile('FREE');
    trpc.preferences.get.useQuery.mockReturnValue(
      queryResult({
        data: {
          chefProfile: {
            preferredUnits: 'METRIC',
            deliveryCurrency: 'USD',
            weeklyBudgetEur: null,
            goal: null,
            showNutritionOnToday: null,
          },
          dietaryPreferences: null,
        },
      }),
    );
    await renderScreen();
    expect(screen.getByTestId('prefs-home-display-switch').props.value).toBe(false);
  });
});

describe('Preferences — opened from a Settings row (UX-ACC-04)', () => {
  it('is titled after the row and wraps the card it names in an anchor', async () => {
    mockSearchParams = { section: 'display' };
    withProfile('FREE');
    await renderScreen();
    expect(screen.getByTestId('preferences-title')).toHaveTextContent('Money & units');
    expect(screen.getByTestId('section-display')).toBeOnTheScreen();
    expect(screen.getByTestId('preferences-display')).toBeOnTheScreen();
  });

  it('keeps its own title when opened without a section', async () => {
    withProfile('FREE');
    await renderScreen();
    expect(screen.getByTestId('preferences-title')).toHaveTextContent('Preferences');
  });
});
