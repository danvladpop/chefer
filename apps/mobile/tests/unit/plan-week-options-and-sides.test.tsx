import { screen, userEvent, waitFor, within } from '@testing-library/react-native';
import { resetSnackbarForTests } from '@chefer/ui-mobile';
import MealPlanScreen from '../../app/(food)/meal-plan';
import { resetRebalanceOfferForTests } from '../../src/features/tracker/rebalance-offer-store';
import { renderWithTrpc, trpcError, type Handlers } from './friends-core-harness';
import { testQueryClient } from './friends-profile-fixtures';

// FB7-11 (Plan page UX): no price line, ONE "Week options" button (new plan /
// rebalance, each described), a card with swap + "…" and a macro line.
// FB7-04: a second dish of the same meal type reads as one meal group with a
// total, and a side can be added from "…" and removed again.

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

const recipe = (id: string, name: string, over: object = {}) => ({
  id,
  name,
  imageUrl: null,
  prepTimeMins: 10,
  cookTimeMins: 20,
  servings: 2,
  nutritionInfo: { calories: 458, protein: 21, carbs: 40, fat: 12 },
  allergenWarnings: [],
  ...over,
});

const mainLunch = {
  type: 'lunch',
  pinned: false,
  portion: 1.5,
  recipe: recipe('r1', 'Lentil Curry'),
};
const dinner = { type: 'dinner', pinned: true, recipe: recipe('r3', 'Salmon Bowl') };
const sideLunch = {
  type: 'lunch',
  pinned: true,
  recipe: recipe('r2', 'Green Salad', {
    nutritionInfo: { calories: 100, protein: 3, carbs: 8, fat: 6 },
  }),
};

const planOf = (meals: object[]) => ({
  planId: 'p1',
  weekStartDate: new Date().toISOString(),
  calorieTarget: 2000,
  days: Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, meals })),
  trainingDays: [],
  tailoring: null,
  // The DTO still carries the cost for old clients; the Plan page just doesn't show it.
  estimatedCost: { totalEur: 40, pricedLines: 5, totalLines: 5 },
});

const nothingToFix = { planId: 'p1', headline: '', swaps: [], snacks: [] };
const somethingToFix = {
  planId: 'p1',
  headline: "You're 36 g short on protein this week.",
  swaps: [
    {
      dayOfWeek: 6,
      mealType: 'dinner',
      previousRecipeId: 'old',
      newRecipeId: 'new',
      previousRecipeName: 'Lentil soup',
      newRecipeName: 'Chicken bowl',
      previousKcal: 520,
      newKcal: 460,
      previousProteinG: 14,
      newProteinG: 42,
      reason: 'protein',
    },
  ],
  snacks: [],
};

const base = (meals: object[], more: Handlers = {}): Handlers => ({
  'mealPlan.getForWeek': () => planOf(meals),
  'mealPlan.getShape': () => null,
  'mealPlan.previewRebalance': () => nothingToFix,
  'targets.get': () => {
    throw trpcError('NOT_FOUND', 404);
  },
  'recipe.list': () => [
    {
      id: 'r9',
      name: 'Rice',
      imageUrl: null,
      isFavourite: false,
      nutritionInfo: { calories: 200, protein: 4, carbs: 44, fat: 1 },
      prepTimeMins: 5,
      cookTimeMins: 15,
      safetyChecks: { checked: [], taggedOnly: [] },
    },
  ],
  'recipe.listHiddenCount': () => ({ hiddenCount: 0, filteredFor: [] }),
  ...more,
});

beforeEach(() => {
  jest.clearAllMocks();
  resetSnackbarForTests();
  resetRebalanceOfferForTests();
});

describe('Plan page — no price, one "Week options" button (FB7-11)', () => {
  it('shows no cost line and no separate Regenerate / Rebalance buttons', async () => {
    await renderWithTrpc(<MealPlanScreen />, base([mainLunch, dinner]), testQueryClient());
    await screen.findByTestId('plan-meal-lunch');
    expect(screen.queryByTestId('plan-week-cost')).toBeNull();
    expect(screen.queryByText(/≈/)).toBeNull();
    expect(screen.queryByTestId('plan-regenerate-action')).toBeNull();
    expect(screen.queryByTestId('rebalance-my-week')).toBeNull();
    expect(screen.getByTestId('plan-week-options')).toBeOnTheScreen();
    expect(screen.getByText('Week options')).toBeOnTheScreen();
  });

  it('the sheet describes both actions; the new plan still asks first', async () => {
    const user = userEvent.setup();
    await renderWithTrpc(
      <MealPlanScreen />,
      base([mainLunch, dinner], { 'mealPlan.previewRebalance': () => somethingToFix }),
      testQueryClient(),
    );
    await screen.findByTestId('rebalance-offer');
    await user.press(await screen.findByTestId('plan-week-options'));
    expect(await screen.findByText('New meal plan for this week')).toBeOnTheScreen();
    expect(screen.getByText('Keeps the meals you pinned.')).toBeOnTheScreen();
    expect(screen.getByText('Rebalance my week')).toBeOnTheScreen();
    expect(
      screen.getByText('Swaps up to 2 upcoming meals to bring your week back on target.'),
    ).toBeOnTheScreen();
    await user.press(screen.getByTestId('plan-week-options-regenerate'));
    expect(await screen.findByTestId('regenerate-confirm-confirm')).toBeOnTheScreen();
  });

  it('Rebalance is disabled, with the reason, when the preview finds nothing', async () => {
    const user = userEvent.setup();
    await renderWithTrpc(<MealPlanScreen />, base([mainLunch, dinner]), testQueryClient());
    await user.press(await screen.findByTestId('plan-week-options'));
    await waitFor(() => expect(screen.getByTestId('plan-week-options-rebalance')).toBeDisabled());
    expect(screen.getByTestId('plan-week-options-rebalance-description')).toHaveTextContent(
      /nothing to swap/,
    );
    expect(screen.queryByTestId('rebalance-offer')).toBeNull();
  });

  it('shows the rebalance offer inline only when the preview has something to fix', async () => {
    await renderWithTrpc(
      <MealPlanScreen />,
      base([mainLunch, dinner], { 'mealPlan.previewRebalance': () => somethingToFix }),
      testQueryClient(),
    );
    expect(await screen.findByTestId('rebalance-offer')).toBeOnTheScreen();
    expect(screen.getByTestId('rebalance-offer-headline')).toHaveTextContent(/36 g short/);
  });
});

describe('Plan card — swap, "…" and macros (FB7-11)', () => {
  it('shows the meta line, the macro line at the portion and a bookmark on a pinned photo', async () => {
    await renderWithTrpc(<MealPlanScreen />, base([mainLunch, dinner]), testQueryClient());
    expect(await screen.findByTestId('plan-meal-lunch-nutrition')).toHaveTextContent(
      '30 min · 687 kcal',
    );
    expect(screen.getByTestId('plan-meal-lunch-macros')).toHaveTextContent(
      'P 32 g · C 60 g · F 18 g',
    );
    // Only the pinned dinner carries the bookmark, and there is no pin button any more.
    expect(screen.getByTestId('plan-meal-dinner-pinned')).toBeOnTheScreen();
    expect(screen.queryByTestId('plan-meal-lunch-pinned')).toBeNull();
    expect(screen.queryByTestId('plan-meal-pin-dinner')).toBeNull();
  });

  it('the action column is swap + "…"; the menu holds keep, add a side dish (no remove on a main)', async () => {
    const user = userEvent.setup();
    await renderWithTrpc(<MealPlanScreen />, base([mainLunch, dinner]), testQueryClient());
    expect(await screen.findByTestId('plan-meal-swap-lunch')).toBeOnTheScreen();
    await user.press(screen.getByTestId('plan-slot-actions-0'));
    expect(await screen.findByText('Keep in next plans')).toBeOnTheScreen();
    expect(screen.getByTestId('slot-action-add-side')).toBeOnTheScreen();
    expect(screen.getByText('Add a side dish')).toBeOnTheScreen();
    expect(screen.queryByTestId('slot-action-remove')).toBeNull();
  });

  it('a pinned meal offers to stop keeping it', async () => {
    const user = userEvent.setup();
    const seen: unknown[] = [];
    await renderWithTrpc(
      <MealPlanScreen />,
      base([mainLunch, dinner], {
        'mealPlan.setSlotPinned': (input) => {
          seen.push(input);
          return { ok: true };
        },
      }),
      testQueryClient(),
    );
    await user.press(await screen.findByTestId('plan-slot-actions-1'));
    await user.press(await screen.findByText('Stop keeping in next plans'));
    await waitFor(() => expect(seen).toHaveLength(1));
    expect(seen[0]).toMatchObject({
      planId: 'p1',
      mealType: 'dinner',
      slotIndex: 1,
      pinned: false,
    });
  });
});

describe('Side dishes (FB7-04)', () => {
  const lunchWithSide = [mainLunch, dinner, sideLunch];

  it('two lunches read as ONE meal: a header, the main, a compact side and a group total', async () => {
    await renderWithTrpc(<MealPlanScreen />, base(lunchWithSide), testQueryClient());
    const group = await screen.findByTestId('plan-group-lunch');
    expect(within(group).getByText('2 dishes')).toBeOnTheScreen();
    expect(within(group).getByTestId('plan-meal-lunch')).toBeOnTheScreen();
    // The side keeps its ORIGINAL slot index (2), whatever the grouping does to the order.
    expect(within(group).getByTestId('plan-side-lunch-2')).toBeOnTheScreen();
    expect(within(group).getByTestId('plan-side-lunch-2-side')).toHaveTextContent('+ side');
    // 687 kcal main (1.5×) + 100 kcal side.
    expect(screen.getByTestId('plan-group-lunch-total')).toHaveTextContent(
      /Lunch total\s*787 kcal · P 35 g · C 68 g · F 24 g/,
    );
    // A lone dinner is a plain card, not a group; the day total counts every dish.
    expect(screen.queryByTestId('plan-group-dinner')).toBeNull();
    expect(screen.getByTestId('plan-day-totals-kcal')).toHaveTextContent('1,245 kcal');
  });

  it('"Add a side dish" opens the picker and adds a second slot of that meal type', async () => {
    const user = userEvent.setup();
    const added: unknown[] = [];
    await renderWithTrpc(
      <MealPlanScreen />,
      base([mainLunch, dinner], {
        'recipe.addToWeek': (input) => {
          added.push(input);
          return {
            planId: 'p1',
            dayOfWeek: 0,
            mealType: 'lunch',
            slotIndex: 2,
            addedRecipeId: 'r9',
            copiedFromId: null,
          };
        },
      }),
      testQueryClient(),
    );
    await user.press(await screen.findByTestId('plan-slot-actions-0'));
    await user.press(await screen.findByTestId('slot-action-add-side'));
    expect(await screen.findByText('Add a side dish')).toBeOnTheScreen();
    await user.press(await screen.findByTestId('picker-recipe-r9'));
    await waitFor(() => expect(added).toHaveLength(1));
    expect(added[0]).toMatchObject({
      recipeId: 'r9',
      weekOffset: 0,
      mealType: 'lunch',
      mode: 'add',
    });
    expect(await screen.findByText(/Added as a side to lunch/)).toBeOnTheScreen();
  });

  it('"Remove from plan" is on the side only, removes that slot and offers Undo', async () => {
    const user = userEvent.setup();
    const removed: unknown[] = [];
    const readded: unknown[] = [];
    await renderWithTrpc(
      <MealPlanScreen />,
      base(lunchWithSide, {
        'mealPlan.removeSlot': (input) => {
          removed.push(input);
          return { ok: true };
        },
        'recipe.addToWeek': (input) => {
          readded.push(input);
          return {
            planId: 'p1',
            dayOfWeek: 0,
            mealType: 'lunch',
            slotIndex: 2,
            addedRecipeId: 'r2',
            copiedFromId: null,
          };
        },
      }),
      testQueryClient(),
    );
    await user.press(await screen.findByTestId('plan-slot-actions-2'));
    await user.press(await screen.findByTestId('slot-action-remove'));
    await waitFor(() => expect(removed).toHaveLength(1));
    expect(removed[0]).toEqual({
      planId: 'p1',
      dayOfWeek: expect.any(Number) as number,
      mealType: 'lunch',
      slotIndex: 2,
    });
    expect(await screen.findByText('Removed Green Salad')).toBeOnTheScreen();
    await user.press(screen.getByText('Undo'));
    await waitFor(() => expect(readded).toHaveLength(1));
    expect(readded[0]).toMatchObject({ recipeId: 'r2', mealType: 'lunch', mode: 'add' });
  });

  it('a refused removal (the only meal of its type) says why', async () => {
    const user = userEvent.setup();
    await renderWithTrpc(
      <MealPlanScreen />,
      base(lunchWithSide, {
        'mealPlan.removeSlot': () => {
          throw trpcError('BAD_REQUEST', 400, {}, 'This is the only lunch of the day.');
        },
      }),
      testQueryClient(),
    );
    await user.press(await screen.findByTestId('plan-slot-actions-2'));
    await user.press(await screen.findByTestId('slot-action-remove'));
    expect(await screen.findByText(/Couldn't remove that dish/)).toBeOnTheScreen();
  });
});
