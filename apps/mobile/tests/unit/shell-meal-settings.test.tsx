import { fireEvent, screen, userEvent, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import {
  getFitTrainingPref,
  resetFitTrainingPrefForTests,
} from '../../src/features/shell/meals/fit-training-pref';
import { MealSettingsScreen } from '../../src/features/shell/meals/meal-settings-screen';
import { renderWithTrpc, type Handlers } from './friends-core-harness';
import { testQueryClient } from './friends-profile-fixtures';

// 10 Oct redesign, board PlanSettingsSheet → the new shell's Meal settings
// screen (/settings/meals): the same shape, saved the same way
// (`mealPlan.setShape`, never fewer than one meal or one day), then — when
// the week already has a plan — back to Meals to confirm a new one.

let mockParams: Record<string, string> = { week: '1' };
let mockCanGoBack = true;
jest.mock('expo-router', () => ({
  router: {
    push: jest.fn(),
    back: jest.fn(),
    navigate: jest.fn(),
    replace: jest.fn(),
    canGoBack: () => mockCanGoBack,
  },
  useLocalSearchParams: () => mockParams,
}));
let mockPremium = false;
jest.mock('../../src/hooks/use-is-premium', () => ({ useIsPremium: () => mockPremium }));
jest.mock('../../src/features/premium/open-premium', () => ({ openPremium: jest.fn() }));

const shape = () => ({
  slots: ['breakfast', 'lunch', 'dinner'],
  days: [0, 1, 2, 3, 4, 5, 6],
  timeCapMins: null,
  weekendNoLimit: false,
  cookingFor: 1,
  leftovers: false,
});

const prefs = {
  chefProfile: {
    deliveryCurrency: 'EUR',
    weeklyBudgetEur: 120,
    preferredUnits: 'METRIC',
    autoPlanWeekly: true,
  },
};

const base = (more: Handlers = {}): Handlers => ({
  'mealPlan.getShape': shape,
  'household.list': () => [],
  'preferences.get': () => prefs,
  'mealPlan.getForWeek': () => null,
  'mealPlan.setShape': (input) => input,
  ...more,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { week: '1' };
  mockCanGoBack = true;
  mockPremium = false;
  resetFitTrainingPrefForTests();
});

describe('Meal settings (new shell)', () => {
  it('shows the board’s groups with the More rows’ current values', async () => {
    await renderWithTrpc(<MealSettingsScreen />, base(), testQueryClient());
    expect(await screen.findByText('What we plan')).toBeOnTheScreen();
    expect(screen.getByText('Cooking time')).toBeOnTheScreen();
    expect(screen.getByText('Longer on weekends')).toBeOnTheScreen();
    expect(screen.getByLabelText('Cooking for, Just me')).toBeOnTheScreen();
    expect(screen.getByLabelText('Weekly budget, €120')).toBeOnTheScreen();
    expect(screen.getByLabelText('Plan my week automatically, Sun')).toBeOnTheScreen();
    expect(screen.getByLabelText('Money & units, EUR · kg')).toBeOnTheScreen();
    // No plan for the week yet: a plain Save.
    expect(screen.getByTestId('meal-settings-save')).toHaveTextContent('Save');
  });

  it('saves the edited shape with setShape and goes back', async () => {
    const user = userEvent.setup();
    const { calls } = await renderWithTrpc(<MealSettingsScreen />, base(), testQueryClient());
    await user.press(await screen.findByTestId('meal-settings-slot-breakfast'));
    await user.press(screen.getByLabelText('Sunday'));
    await user.press(screen.getByTestId('meal-settings-time-30'));
    await user.press(screen.getByTestId('meal-settings-save'));
    await waitFor(() =>
      expect(calls.find((c) => c.path === 'mealPlan.setShape')?.input).toEqual({
        slots: ['lunch', 'dinner'],
        days: [0, 1, 2, 3, 4, 5],
        timeCapMins: 30,
        weekendNoLimit: false,
        cookingFor: 1,
        leftovers: false,
      }),
    );
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('never drops the last meal or the last day (the shared validation)', async () => {
    const user = userEvent.setup();
    const { calls } = await renderWithTrpc(
      <MealSettingsScreen />,
      base({ 'mealPlan.getShape': () => ({ ...shape(), slots: ['dinner'], days: [2] }) }),
      testQueryClient(),
    );
    await user.press(await screen.findByTestId('meal-settings-slot-dinner'));
    await user.press(screen.getByLabelText('Wednesday'));
    expect(screen.getByLabelText('Wednesday')).toBeChecked();
    await user.press(screen.getByTestId('meal-settings-save'));
    await waitFor(() =>
      expect(calls.find((c) => c.path === 'mealPlan.setShape')?.input).toMatchObject({
        slots: ['dinner'],
        days: [2],
      }),
    );
  });

  it('with a plan for the week it says so and sends Meals to ask about a new plan', async () => {
    const user = userEvent.setup();
    await renderWithTrpc(
      <MealSettingsScreen />,
      base({
        'mealPlan.getForWeek': () => ({ planId: 'p1', days: [], trainingDays: [] }),
      }),
      testQueryClient(),
    );
    const save = await screen.findByTestId('meal-settings-save');
    await waitFor(() => expect(save).toHaveTextContent('Save and re-plan next week'));
    await user.press(save);
    await waitFor(() =>
      expect(router.navigate).toHaveBeenCalledWith({
        pathname: '/plan',
        params: expect.objectContaining({ week: '1', replan: '1' }) as unknown,
      }),
    );
  });

  it('a failed save says so and stays', async () => {
    const user = userEvent.setup();
    await renderWithTrpc(
      <MealSettingsScreen />,
      base({
        'mealPlan.setShape': () => {
          throw new Error('boom');
        },
      }),
      testQueryClient(),
    );
    await user.press(await screen.findByTestId('meal-settings-save'));
    expect(await screen.findByTestId('meal-settings-error')).toBeOnTheScreen();
    expect(router.back).not.toHaveBeenCalled();
  });

  it('premium: leftover lunches saves with the shape', async () => {
    mockPremium = true;
    const user = userEvent.setup();
    const { calls } = await renderWithTrpc(<MealSettingsScreen />, base(), testQueryClient());
    await fireEvent(await screen.findByTestId('meal-settings-leftovers'), 'valueChange', true);
    await user.press(screen.getByTestId('meal-settings-save'));
    await waitFor(() =>
      expect(calls.find((c) => c.path === 'mealPlan.setShape')?.input).toMatchObject({
        leftovers: true,
      }),
    );
  });

  it('training days: Fit meals is a session choice for the next plan (premium)', async () => {
    mockPremium = true;
    await renderWithTrpc(
      <MealSettingsScreen />,
      base({
        'mealPlan.getForWeek': () => ({
          planId: 'p1',
          days: [],
          trainingDays: [{ dayOfWeek: 1, kind: 'gym', applied: true }],
        }),
      }),
      testQueryClient(),
    );
    const toggle = await screen.findByTestId('meal-settings-fit-training');
    expect(toggle.props.value).toBe(true);
    await fireEvent(toggle, 'valueChange', false);
    expect(getFitTrainingPref()).toBe(false);
  });

  it('free: Fit meals is locked with the Premium link', async () => {
    await renderWithTrpc(
      <MealSettingsScreen />,
      base({
        'mealPlan.getForWeek': () => ({
          planId: 'p1',
          days: [],
          trainingDays: [{ dayOfWeek: 1, kind: 'gym', applied: true }],
        }),
      }),
      testQueryClient(),
    );
    expect(await screen.findByTestId('meal-settings-fit-training')).toBeDisabled();
    expect(screen.getByTestId('meal-settings-fit-training-premium')).toBeOnTheScreen();
    // Leftover lunches stays premium-only, as on the old sheet.
    expect(screen.queryByTestId('meal-settings-leftovers')).toBeNull();
  });

  it('Cooking for links to the household when there is one', async () => {
    const user = userEvent.setup();
    await renderWithTrpc(
      <MealSettingsScreen />,
      base({ 'household.list': () => [{ id: 'm1', name: 'Ana' }] }),
      testQueryClient(),
    );
    await user.press(await screen.findByLabelText('Cooking for, You + Ana'));
    expect(router.push).toHaveBeenCalledWith('/household');
  });

  it('More rows open the matching Preferences sections', async () => {
    const user = userEvent.setup();
    await renderWithTrpc(<MealSettingsScreen />, base(), testQueryClient());
    await user.press(await screen.findByTestId('meal-settings-safety'));
    expect(router.push).toHaveBeenCalledWith('/preferences?section=safety');
  });
});
