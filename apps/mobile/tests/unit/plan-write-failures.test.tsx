import { act, screen, userEvent, waitFor } from '@testing-library/react-native';
import { resetSnackbarForTests } from '@chefer/ui-mobile';
import MealPlanScreen from '../../app/(food)/meal-plan';
import { renderWithTrpc, trpcError, type Handlers } from './friends-core-harness';
import { testQueryClient } from './friends-profile-fixtures';

// UX-PLAN-14: pin / Undo-after-Regenerate failures used to vanish (no
// onError), and the day view could not be pulled to refresh.

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useIsFocused: () => true,
  useLocalSearchParams: () => ({}),
}));
jest.mock('../../src/features/ai-consent/ai-consent-provider', () => ({
  useAiConsent: () => (_feature: string, run: () => void) => run(),
  AiConsentHost: () => null,
}));
jest.mock('../../src/features/gym/components/mode-switch', () => ({ ModeSwitch: () => null }));
jest.mock('../../src/features/tracker/rebalance-banner', () => ({ RebalanceBanner: () => null }));
jest.mock('../../src/hooks/use-currency', () => ({ useCurrency: () => 'EUR' }));
jest.mock('../../src/hooks/use-household', () => ({
  useHousehold: () => ({ memberCount: 0, tablePortions: null, portionSum: null }),
}));
jest.mock('../../src/hooks/use-is-premium', () => ({ useIsPremium: () => false }));

const meal = {
  type: 'dinner',
  pinned: false,
  recipe: {
    id: 'r1',
    name: 'Lentil Curry',
    imageUrl: null,
    prepTimeMins: 10,
    cookTimeMins: 20,
    servings: 2,
    nutritionInfo: { calories: 540, protein: 25, carbs: 60, fat: 12 },
    allergenWarnings: [],
  },
};

const plan = {
  planId: 'p1',
  weekStartDate: new Date().toISOString(),
  calorieTarget: 2000,
  days: Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, meals: [meal] })),
  trainingDays: [],
  tailoring: null,
};

const base = (more: Handlers = {}): Handlers => ({
  'mealPlan.getForWeek': () => plan,
  'mealPlan.getShape': () => null,
  'targets.get': () => {
    throw trpcError('NOT_FOUND', 404);
  },
  ...more,
});

const serverDown = () => {
  throw trpcError('INTERNAL_SERVER_ERROR', 500, {}, 'boom');
};

beforeEach(() => {
  jest.clearAllMocks();
  resetSnackbarForTests();
});

describe('Plan: pin and Undo failures (UX-PLAN-14)', () => {
  it('a failed Undo after Regenerate says so and offers Try again', async () => {
    let restoreUp = false;
    const user = userEvent.setup();
    const { paths } = await renderWithTrpc(
      <MealPlanScreen />,
      base({
        'mealPlan.generate': () => ({ ...plan, planId: 'p2', previousPlanId: 'p1' }),
        'mealPlan.restore': () => (restoreUp ? plan : serverDown()),
      }),
      testQueryClient(),
    );
    await user.press(await screen.findByTestId('plan-regenerate-action'));
    await user.press(await screen.findByTestId('regenerate-confirm-confirm'));
    await user.press(await screen.findByText('Undo'));
    expect(await screen.findByText(/Couldn't bring your previous week back/)).toBeOnTheScreen();
    restoreUp = true;
    await user.press(screen.getByText('Try again'));
    await waitFor(() => expect(paths().filter((p) => p === 'mealPlan.restore')).toHaveLength(2));
  });

  it('a failed pin says so instead of doing nothing', async () => {
    const user = userEvent.setup();
    await renderWithTrpc(
      <MealPlanScreen />,
      base({ 'mealPlan.setSlotPinned': serverDown }),
      testQueryClient(),
    );
    await user.press(await screen.findByTestId('plan-meal-pin-dinner'));
    expect(await screen.findByText(/Couldn't update that pin/)).toBeOnTheScreen();
  });

  it('the day view can be pulled to refresh', async () => {
    let loads = 0;
    const { calls } = await renderWithTrpc(
      <MealPlanScreen />,
      base({
        'mealPlan.getForWeek': () => {
          loads += 1;
          return plan;
        },
      }),
      testQueryClient(),
    );
    await screen.findByTestId('plan-meal-pin-dinner');
    expect(loads).toBe(1);
    const { refreshControl } = screen.getByTestId('plan-day-scroll').props as {
      refreshControl: { props: { onRefresh: () => void } };
    };
    await act(() => {
      refreshControl.props.onRefresh();
    });
    await waitFor(() => expect(loads).toBe(2));
    expect(calls.filter((c) => c.path === 'mealPlan.getForWeek')).toHaveLength(2);
  });
});
