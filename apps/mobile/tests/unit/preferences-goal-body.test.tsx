import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, screen, userEvent } from '@testing-library/react-native';
import PreferencesScreen from '../../app/preferences';
import type { GoalBodySavePayload } from '../../src/features/preferences/goal-body-card';
import type { createTrpcPreferencesMock } from './preferences-trpc-mock';
import { mutationResult, queryResult } from './preferences-trpc-mock';

// PreferencesScreen (imported above) transitively imports `../src/lib/trpc`
// before this file's own mock import would run, so the factory has to
// `require()` lazily — same reasoning as gym-setup.test.tsx.
jest.mock('../../src/lib/trpc', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- see comment above
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

beforeEach(() => {
  jest.clearAllMocks();
  // A FREE user (not premium, not admin) — dogfood feedback #6 is specifically
  // about goal-setting working on every tier, so the default fixture is free.
  trpc.auth.me.useQuery.mockReturnValue(queryResult({ data: { planTier: 'FREE', role: 'USER' } }));
  trpc.preferences.get.useQuery.mockReturnValue(
    queryResult({ data: { chefProfile: null, dietaryPreferences: null } }),
  );
  trpc.preferences.updateSafety.useMutation.mockReturnValue(mutationResult());
  trpc.preferences.updateTargets.useMutation.mockReturnValue(mutationResult());
  trpc.preferences.saveProfileBasics.useMutation.mockReturnValue(mutationResult());
  trpc.preferences.setDisplayPreferences.useMutation.mockReturnValue(mutationResult());
});

describe('Preferences — Goal & body (dogfood feedback #6)', () => {
  it('renders the Goal & body section for a free user', async () => {
    await renderScreen();
    expect(screen.getByTestId('preferences-goal-body')).toBeOnTheScreen();
    expect(screen.getByTestId('prefs-save-goal-body')).toBeOnTheScreen();
    // The budget stays premium-gated — the goal/body save button doesn't.
    expect(screen.queryByTestId('prefs-save-extras')).not.toBeOnTheScreen();
  });

  it('lets a free user pick a goal and saves it through saveProfileBasics', async () => {
    const mutate = jest.fn();
    trpc.preferences.saveProfileBasics.useMutation.mockReturnValue(mutationResult({ mutate }));
    const user = userEvent.setup();
    await renderScreen();

    await user.press(screen.getByTestId('goal-LOSE_WEIGHT'));
    await user.press(screen.getByTestId('prefs-save-goal-body'));

    expect(mutate).toHaveBeenCalledTimes(1);
    const payload = (mutate.mock.calls[0] as [GoalBodySavePayload])[0];
    expect(payload).toEqual({ goal: 'LOSE_WEIGHT' });
  });

  it('includes body metrics in the payload once they are filled in', async () => {
    const mutate = jest.fn();
    trpc.preferences.saveProfileBasics.useMutation.mockReturnValue(mutationResult({ mutate }));
    const user = userEvent.setup();
    await renderScreen();

    await user.press(screen.getByTestId('goal-GAIN_MUSCLE'));
    await user.press(screen.getByTestId('metrics-sex-MALE'));
    await user.type(screen.getByTestId('metrics-age'), '28');
    await user.type(screen.getByTestId('metrics-height'), '180');
    await user.type(screen.getByTestId('metrics-weight'), '82');
    await user.press(screen.getByTestId('metrics-activity-MODERATELY_ACTIVE'));
    await user.press(screen.getByTestId('prefs-save-goal-body'));

    expect(mutate).toHaveBeenCalledTimes(1);
    const payload = (mutate.mock.calls[0] as [GoalBodySavePayload])[0];
    expect(payload).toEqual({
      goal: 'GAIN_MUSCLE',
      biologicalSex: 'MALE',
      age: 28,
      heightCm: 180,
      weightKg: 82,
      activityLevel: 'MODERATELY_ACTIVE',
    });
  });

  it('shows a lifter the bodyweight protein and why, from computeTargets', async () => {
    trpc.preferences.get.useQuery.mockReturnValue(
      queryResult({
        data: {
          chefProfile: {
            goal: 'GAIN_MUSCLE',
            biologicalSex: 'MALE',
            age: 30,
            heightCm: 180,
            weightKg: 80,
            activityLevel: 'MODERATELY_ACTIVE',
          },
          dietaryPreferences: null,
        },
      }),
    );
    trpc.preferences.computeTargets.useQuery.mockReturnValue({
      data: { proteinG: 144, lifter: { bodyweightKg: 80, proteinGPerKg: 1.8 } },
    });
    await renderScreen();

    expect(trpc.preferences.computeTargets.useQuery).toHaveBeenLastCalledWith(
      {
        goal: 'GAIN_MUSCLE',
        biologicalSex: 'MALE',
        age: 30,
        heightCm: 180,
        weightKg: 80,
        activityLevel: 'MODERATELY_ACTIVE',
      },
      expect.anything(),
    );
    expect(screen.getByText('144 g protein / day')).toBeOnTheScreen();
    expect(
      screen.getByText('Protein set from your bodyweight (1.8 g/kg) because you train.'),
    ).toBeOnTheScreen();
  });

  it('shows no protein line for a non-lifter', async () => {
    trpc.preferences.computeTargets.useQuery.mockReturnValue({
      data: { proteinG: 176, lifter: null },
    });
    await renderScreen();
    expect(screen.queryByTestId('metrics-lifter-protein')).not.toBeOnTheScreen();
  });
});
