import { screen, userEvent, waitFor, within } from '@testing-library/react-native';
import { router } from 'expo-router';
import { resetSnackbarForTests } from '@chefer/ui-mobile';
import { MealsScreen } from '../../src/features/shell/meals/meals-screen';
import { resetRebalanceOfferForTests } from '../../src/features/tracker/rebalance-offer-store';
import { renderWithTrpc, trpcError, type Handlers } from './friends-core-harness';
import { testQueryClient } from './friends-profile-fixtures';

// 10 Oct redesign, board "Plan" → the new shell's Meals tab: day strip, the
// day's totals (legacy maths: portions count), meal tiles whose swap button
// opens the replace picker, the Change week sheet, one safety line.

let mockParams: Record<string, string> = { week: '0' };
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), navigate: jest.fn() },
  useIsFocused: () => true,
  useLocalSearchParams: () => mockParams,
}));
jest.mock('../../src/features/ai-consent/ai-consent-provider', () => ({
  useAiConsent: () => (_feature: string, run: () => void) => run(),
  AiConsentHost: () => null,
}));
jest.mock('../../src/features/tracker/rebalance-banner', () => ({ RebalanceBanner: () => null }));
jest.mock('../../src/hooks/use-household', () => ({
  useHousehold: () => ({ memberCount: 0, tablePortions: null, portionSum: null }),
}));
jest.mock('../../src/hooks/use-is-premium', () => ({ useIsPremium: () => false }));

const recipe = (id: string, name: string, calories: number, over: object = {}) => ({
  id,
  name,
  imageUrl: null,
  prepTimeMins: 5,
  cookTimeMins: 5,
  servings: 2,
  nutritionInfo: { calories, protein: 30, carbs: 50, fat: 10 },
  allergenWarnings: [],
  ...over,
});

const wednesday = [
  { type: 'breakfast', pinned: false, recipe: recipe('b1', 'Greek Yogurt Bowl', 600) },
  { type: 'lunch', pinned: true, recipe: recipe('l1', 'Chickpea Bowl', 700) },
  { type: 'dinner', pinned: false, portion: 1.5, recipe: recipe('d1', 'Salmon Quinoa', 600) },
  { type: 'dinner', pinned: false, recipe: recipe('s1', 'Green Beans', 120) },
];
const thursday = [{ type: 'lunch', pinned: false, recipe: recipe('l2', 'Lentil Soup', 450) }];

const plan = () => ({
  planId: 'p1',
  weekStartDate: new Date(2026, 9, 5).toISOString(),
  calorieTarget: 2400,
  days: Array.from({ length: 7 }, (_, dayOfWeek) => ({
    dayOfWeek,
    meals: dayOfWeek === 2 ? wednesday : dayOfWeek === 3 ? thursday : [],
    planned: dayOfWeek === 2 || dayOfWeek === 3,
  })),
  trainingDays: [],
  tailoring: null,
  tableSafety: {
    hasRules: true,
    needsReview: false,
    people: [
      {
        who: 'You',
        isOwner: true,
        notes: [],
        items: [
          { id: 'a', label: 'Peanuts', kind: 'allergy' },
          { id: 'b', label: 'Shellfish', kind: 'allergy' },
          { id: 'c', label: 'Olives', kind: 'dislike' },
        ],
      },
    ],
  },
});

const base = (more: Handlers = {}): Handlers => ({
  'mealPlan.getForWeek': plan,
  'mealPlan.getShape': () => null,
  'mealPlan.previewRebalance': () => ({ planId: 'p1', headline: '', swaps: [], snacks: [] }),
  'targets.get': () => {
    throw trpcError('NOT_FOUND', 404);
  },
  'tracker.getDay': () => ({ log: null, skippedSlots: [] }),
  'recipe.list': () => [
    {
      id: 'r9',
      name: 'Rice Bowl',
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

// A Wednesday noon (not the weekend): "This week" opens, today = Wednesday.
beforeAll(() => {
  jest.useFakeTimers({
    now: new Date(2026, 9, 7, 12, 0, 0),
    doNotFake: [
      'hrtime',
      'nextTick',
      'performance',
      'queueMicrotask',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'requestIdleCallback',
      'cancelIdleCallback',
      'setImmediate',
      'clearImmediate',
      'setInterval',
      'clearInterval',
      'setTimeout',
      'clearTimeout',
    ],
  });
});
afterAll(() => {
  jest.useRealTimers();
});

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { week: '0' };
  resetSnackbarForTests();
  resetRebalanceOfferForTests();
});

describe('Meals tab (new shell)', () => {
  it('shows the day as tiles: meal type labels, a Side, and the meta line', async () => {
    await renderWithTrpc(<MealsScreen />, base(), testQueryClient());
    expect(await screen.findByTestId('meals-tile-breakfast-0')).toBeOnTheScreen();
    expect(screen.getByText('Greek Yogurt Bowl')).toBeOnTheScreen();
    expect(screen.getByText('600 kcal · 10 min')).toBeOnTheScreen();
    // A pinned meal says so instead of its time.
    expect(screen.getByText('700 kcal · pinned')).toBeOnTheScreen();
    // The portion counts (1.5 × 600), and the side names its meal.
    expect(screen.getByText('900 kcal · 1½× portion · 10 min')).toBeOnTheScreen();
    expect(screen.getByText('Dinner · 120 kcal')).toBeOnTheScreen();
    expect(screen.getByLabelText(/^Side, Green Beans/)).toBeOnTheScreen();
  });

  it('totals the day with the legacy maths and shows the target', async () => {
    await renderWithTrpc(<MealsScreen />, base(), testQueryClient());
    // 600 + 700 + 900 + 120 = 2,320
    expect(await screen.findByTestId('meals-day-kcal')).toHaveTextContent('2,320 kcal');
    expect(screen.getByTestId('meals-day-target')).toHaveTextContent('target 2,400');
    expect(screen.getByText('Wednesday')).toBeOnTheScreen();
    // Protein 30 + 30 + 45 + 30.
    expect(screen.getByLabelText('Protein, 135 grams')).toBeOnTheScreen();
  });

  it('switching the day shows that day’s meals and totals', async () => {
    const user = userEvent.setup();
    await renderWithTrpc(<MealsScreen />, base(), testQueryClient());
    await screen.findByTestId('meals-tile-breakfast-0');
    await user.press(screen.getByTestId('meals-days-3'));
    expect(await screen.findByText('Lentil Soup')).toBeOnTheScreen();
    expect(screen.queryByText('Greek Yogurt Bowl')).toBeNull();
    expect(screen.getByTestId('meals-day-kcal')).toHaveTextContent('450 kcal');
    expect(screen.getByText('Thursday')).toBeOnTheScreen();
  });

  it('a tile’s swap button opens the replace picker for that meal', async () => {
    const user = userEvent.setup();
    await renderWithTrpc(<MealsScreen />, base(), testQueryClient());
    await user.press(await screen.findByLabelText('Change breakfast'));
    expect(await screen.findByTestId('picker-title')).toHaveTextContent('Greek Yogurt Bowl');
    expect(await screen.findByTestId('picker-recipe-r9')).toBeOnTheScreen();
    // The meal's other actions are one row away on the same sheet.
    expect(screen.getByTestId('meals-meal-options')).toBeOnTheScreen();
  });

  it('More options on the Change sheet opens the meal’s menu (keep, side dish…)', async () => {
    const user = userEvent.setup();
    await renderWithTrpc(<MealsScreen />, base(), testQueryClient());
    await user.press(await screen.findByLabelText('Change lunch'));
    await user.press(await screen.findByTestId('meals-meal-options'));
    expect(await screen.findByTestId('slot-action-pin', {}, { timeout: 3000 })).toBeOnTheScreen();
    expect(screen.getByText('Stop keeping in next plans')).toBeOnTheScreen();
    expect(screen.getByTestId('slot-action-add-side')).toBeOnTheScreen();
  });

  it('a dish that conflicts with the table says so', async () => {
    const conflicting = [
      {
        type: 'dinner',
        pinned: false,
        recipe: recipe('x1', 'Satay Noodles', 600, { allergenWarnings: ['Peanuts'] }),
      },
    ];
    await renderWithTrpc(
      <MealsScreen />,
      base({
        'mealPlan.getForWeek': () => ({
          ...plan(),
          days: plan().days.map((d) => (d.dayOfWeek === 2 ? { ...d, meals: conflicting } : d)),
        }),
      }),
      testQueryClient(),
    );
    expect(await screen.findByTestId('meals-conflict-0')).toHaveTextContent(/Satay Noodles: /);
  });

  it('picking a recipe replaces the slot with Undo', async () => {
    const user = userEvent.setup();
    const replace = jest.fn(() => ({
      name: 'Rice Bowl',
      previousRecipeId: 'b1',
      previousPinned: false,
    }));
    const { calls } = await renderWithTrpc(
      <MealsScreen />,
      base({ 'mealPlan.replaceRecipe': replace }),
      testQueryClient(),
    );
    await user.press(await screen.findByLabelText('Change breakfast'));
    await user.press(await screen.findByTestId('picker-recipe-r9'));
    await waitFor(() =>
      expect(calls.find((c) => c.path === 'mealPlan.replaceRecipe')?.input).toEqual({
        planId: 'p1',
        dayOfWeek: 2,
        mealType: 'breakfast',
        slotIndex: 0,
        recipeId: 'r9',
      }),
    );
    expect(await screen.findByText('Swapped to Rice Bowl')).toBeOnTheScreen();
    expect(screen.getByText('Undo')).toBeOnTheScreen();
  });

  it('a tile opens the recipe with the day and meal', async () => {
    const user = userEvent.setup();
    await renderWithTrpc(<MealsScreen />, base(), testQueryClient());
    await user.press(await screen.findByLabelText(/^Dinner, Salmon Quinoa/));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/recipe/[id]',
      params: { id: 'd1', day: '2', meal: 'dinner', portion: '1.5' },
    });
  });

  it('one safety line names the table’s allergies; info opens the full text', async () => {
    const user = userEvent.setup();
    await renderWithTrpc(<MealsScreen />, base(), testQueryClient());
    expect(await screen.findByTestId('meals-safety-text')).toHaveTextContent(
      'Checked for peanuts and shellfish. Always read labels.',
    );
    await user.press(screen.getByLabelText('About meal suggestions and allergen checks'));
    expect(await screen.findByTestId('meals-about-sentence')).toHaveTextContent(/suggestion/i);
  });

  it('the Cookbook card opens the cookbook and adds a recipe', async () => {
    const user = userEvent.setup();
    await renderWithTrpc(<MealsScreen />, base(), testQueryClient());
    await user.press(await screen.findByTestId('meals-cookbook-open'));
    expect(router.push).toHaveBeenCalledWith('/cookbook');
    await user.press(screen.getByLabelText('New recipe'));
    expect(router.push).toHaveBeenCalledWith('/recipe-form');
  });

  it('an empty week offers to generate, and Change what we plan opens Meal settings', async () => {
    const user = userEvent.setup();
    await renderWithTrpc(
      <MealsScreen />,
      base({ 'mealPlan.getForWeek': () => null }),
      testQueryClient(),
    );
    expect(await screen.findByTestId('meals-empty')).toBeOnTheScreen();
    expect(screen.getByTestId('meals-generate')).toBeOnTheScreen();
    await user.press(screen.getByTestId('meals-change-shape'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/settings/meals',
      params: { week: '0' },
    });
  });

  it('switching to Next week asks for that week', async () => {
    const user = userEvent.setup();
    const { calls } = await renderWithTrpc(<MealsScreen />, base(), testQueryClient());
    await screen.findByTestId('meals-tile-breakfast-0');
    await user.press(screen.getByTestId('meals-week-1'));
    await waitFor(() =>
      expect(
        calls.some(
          (c) =>
            c.path === 'mealPlan.getForWeek' &&
            (c.input as { weekOffset: number }).weekOffset === 1,
        ),
      ).toBe(true),
    );
  });

  it('the Swap deep link selects the week and day and opens that slot’s picker once', async () => {
    mockParams = { week: '0', day: '3', swap: 'lunch', at: '100' };
    const user = userEvent.setup();
    await renderWithTrpc(<MealsScreen />, base(), testQueryClient());
    expect(await screen.findByTestId('picker-title')).toHaveTextContent('Lentil Soup');
    expect(screen.getByTestId('meals-days-3')).toBeSelected();
    expect(screen.getByTestId('meals-day-kcal')).toHaveTextContent('450 kcal');
    // Closed, then any re-render with the same `at` does not reopen it.
    await user.press(screen.getByTestId('picker-close'));
    await waitFor(() => expect(screen.queryByTestId('picker-title')).toBeNull());
    await user.press(screen.getByTestId('meals-days-2'));
    await user.press(screen.getByTestId('meals-days-3'));
    expect(screen.queryByTestId('picker-title')).toBeNull();
  });

  it('a new `at` on the mounted tab re-applies week, day and swap', async () => {
    const user = userEvent.setup();
    mockParams = { week: '0' };
    await renderWithTrpc(<MealsScreen />, base(), testQueryClient());
    await screen.findByTestId('meals-tile-breakfast-0');
    await user.press(screen.getByTestId('meals-days-3'));
    // The tab stays mounted; a new link arrives (any render reads the new params).
    mockParams = { week: '0', day: '2', swap: 'dinner', at: '200' };
    await user.press(screen.getByTestId('meals-days-4'));
    expect(await screen.findByTestId('picker-title')).toHaveTextContent('Salmon Quinoa');
  });

  it('a link without swap just selects the day', async () => {
    mockParams = { week: '0', day: '3', at: '300' };
    await renderWithTrpc(<MealsScreen />, base(), testQueryClient());
    expect(await screen.findByText('Lentil Soup')).toBeOnTheScreen();
    expect(screen.queryByTestId('picker-title')).toBeNull();
  });

  it('coming back from Meal settings with replan=1 asks about a new plan', async () => {
    mockParams = { week: '0', replan: '1', at: '1' };
    await renderWithTrpc(<MealsScreen />, base(), testQueryClient());
    expect(await screen.findByTestId('regenerate-confirm-confirm')).toBeOnTheScreen();
  });
});

describe('Change week sheet', () => {
  it('names the week and lists new plan, rebalance and Meal settings', async () => {
    const user = userEvent.setup();
    await renderWithTrpc(<MealsScreen />, base(), testQueryClient());
    await user.press(await screen.findByTestId('meals-change-week'));
    const sheet = await screen.findByTestId('change-week-sheet');
    expect(within(sheet).getByText('This week')).toBeOnTheScreen();
    expect(screen.getByTestId('change-week-sheet-title')).toHaveTextContent('Change week');
    expect(screen.getByText('New plan for this week')).toBeOnTheScreen();
    expect(screen.getByText('Keeps pinned meals')).toBeOnTheScreen();
    expect(screen.getByText('Rebalance my week')).toBeOnTheScreen();
    expect(screen.getByText('Swaps up to 2 meals to get back on target')).toBeOnTheScreen();
    expect(screen.getByText('Meal settings')).toBeOnTheScreen();
    expect(screen.getByText('Meals, days, cooking time')).toBeOnTheScreen();
  });

  it('New plan asks first (the regenerate confirm)', async () => {
    const user = userEvent.setup();
    await renderWithTrpc(<MealsScreen />, base(), testQueryClient());
    await user.press(await screen.findByTestId('meals-change-week'));
    await user.press(await screen.findByTestId('change-week-new-plan'));
    expect(await screen.findByTestId('regenerate-confirm-confirm')).toBeOnTheScreen();
  });

  it('Meal settings pushes the settings screen for this week', async () => {
    const user = userEvent.setup();
    await renderWithTrpc(<MealsScreen />, base(), testQueryClient());
    await user.press(await screen.findByTestId('meals-change-week'));
    await user.press(await screen.findByTestId('change-week-settings'));
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith({
        pathname: '/settings/meals',
        params: { week: '0' },
      }),
    );
  });

  it('Rebalance says when the week is already on target', async () => {
    const user = userEvent.setup();
    await renderWithTrpc(<MealsScreen />, base(), testQueryClient());
    await user.press(await screen.findByTestId('meals-change-week'));
    await user.press(await screen.findByTestId('change-week-rebalance'));
    expect((await screen.findAllByText(/nothing to swap/)).length).toBeGreaterThan(0);
  });

  it('next week has no Rebalance row', async () => {
    mockParams = { week: '1' };
    const user = userEvent.setup();
    await renderWithTrpc(<MealsScreen />, base(), testQueryClient());
    await user.press(await screen.findByTestId('meals-change-week'));
    expect(await screen.findByText('New plan for next week')).toBeOnTheScreen();
    expect(screen.queryByTestId('change-week-rebalance')).toBeNull();
  });
});
