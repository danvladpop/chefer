import { screen, userEvent, waitFor } from '@testing-library/react-native';
import MealPlanScreen from '../../app/(food)/meal-plan';
import { renderWithTrpc, trpcError, type Handlers } from './friends-core-harness';
import { testQueryClient } from './friends-profile-fixtures';

// WP-06 on the Plan day: a meal still to eat today (or earlier this week) gets
// the overflow ("Ate something else" / "Skipped it"); a swapped one reads "You
// had: …", a skipped one "Skipped", each with Remove / Undo; the day's planned
// total leaves both out; later days have no overflow.

const ONLY_THE_CLOCK: (
  | 'setTimeout'
  | 'clearTimeout'
  | 'setInterval'
  | 'clearInterval'
  | 'setImmediate'
  | 'clearImmediate'
  | 'nextTick'
  | 'queueMicrotask'
  | 'requestAnimationFrame'
  | 'cancelAnimationFrame'
  | 'requestIdleCallback'
  | 'cancelIdleCallback'
  | 'hrtime'
  | 'performance'
)[] = [
  'setTimeout',
  'clearTimeout',
  'setInterval',
  'clearInterval',
  'setImmediate',
  'clearImmediate',
  'nextTick',
  'queueMicrotask',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'requestIdleCallback',
  'cancelIdleCallback',
  'hrtime',
  'performance',
];

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
jest.mock('../../src/features/tracker/scan-meal-card', () => ({ ScanMealCard: () => null }));
jest.mock('../../src/features/tracker/rebalance-store', () => ({ recordRebalance: jest.fn() }));
jest.mock('../../src/hooks/use-currency', () => ({ useCurrency: () => 'EUR' }));
jest.mock('../../src/hooks/use-household', () => ({
  useHousehold: () => ({ memberCount: 0, tablePortions: null, portionSum: null }),
}));
jest.mock('../../src/hooks/use-is-premium', () => ({ useIsPremium: () => false }));

// Wednesday 2 Sep 2026, 10:00 → Plan opens on this week, Wednesday (day 2).
const WEDNESDAY = '2026-09-02';
const rebalance = { rebalanced: false, swaps: [], projectedDeviation: 0, planId: 'p' };

const meal = (type: string, id: string, name: string, calories: number) => ({
  type,
  pinned: false,
  recipe: {
    id,
    name,
    imageUrl: null,
    prepTimeMins: 10,
    cookTimeMins: 20,
    servings: 2,
    nutritionInfo: { calories, protein: 25, carbs: 60, fat: 12 },
    allergenWarnings: [],
  },
});

const plan = {
  planId: 'p0',
  weekStartDate: new Date(2026, 8, 2).toISOString(),
  calorieTarget: 2000,
  days: Array.from({ length: 7 }, (_, dayOfWeek) => ({
    dayOfWeek,
    meals: [
      meal('breakfast', `b${dayOfWeek}`, `Oats ${dayOfWeek}`, 450),
      meal('dinner', `d${dayOfWeek}`, `Salmon ${dayOfWeek}`, 540),
    ],
  })),
  trainingDays: [],
  tailoring: null,
};

const replacement = {
  entryId: 'e1',
  custom: { name: 'Pizza · normal', estimatedBy: 'manual' },
  mealType: 'breakfast',
  replacesSlot: { mealType: 'breakfast', slotIndex: 0 },
  portionMultiplier: 1,
  kcal: 775,
  protein: 30,
  carbs: 0,
  fat: 0,
  unknownMacros: ['carbs', 'fat'],
};

function handlers(day: Record<string, unknown>, seen: Record<string, unknown[]>): Handlers {
  const record =
    (path: string, answer: unknown) =>
    (input: unknown): unknown => {
      (seen[path] ??= []).push(input);
      return answer;
    };
  return {
    'mealPlan.getForWeek': () => plan,
    'mealPlan.getShape': () => null,
    'targets.get': () => {
      throw trpcError('NOT_FOUND', 404);
    },
    'recipe.list': () => [],
    'recipe.listHiddenCount': () => ({ hiddenCount: 0 }),
    'tracker.getDay': record('getDay', { log: null, skippedSlots: [], ...day }),
    'tracker.recents': () => [],
    'tracker.logCustomMeal': record('logCustomMeal', { log: {}, rebalance, entryId: 'new-1' }),
    'tracker.deleteEntries': record('deleteEntries', {}),
    'tracker.restoreCustomMeal': record('restoreCustomMeal', {}),
    'tracker.skipSlot': record('skipSlot', { log: {}, skippedSlots: [], rebalance }),
    'tracker.unskipSlot': record('unskipSlot', { log: {}, skippedSlots: [] }),
  };
}

const dayTotal = () => screen.getByTestId('plan-day-totals-kcal');

beforeEach(() => {
  jest.useFakeTimers({ now: new Date(2026, 8, 2, 10, 0), doNotFake: ONLY_THE_CLOCK });
});
afterEach(() => jest.useRealTimers());

describe('Plan day — overflow on a planned slot (WP-06)', () => {
  it("today's meals have the overflow, and quick estimate replaces that slot for that date", async () => {
    const seen: Record<string, unknown[]> = {};
    const user = userEvent.setup();
    await renderWithTrpc(<MealPlanScreen />, handlers({}, seen), testQueryClient());
    expect(await screen.findByLabelText('More actions for Breakfast')).toBeOnTheScreen();
    expect(screen.getByLabelText('More actions for Dinner')).toBeOnTheScreen();
    await user.press(screen.getByTestId('plan-slot-actions-0'));
    expect(screen.getByTestId('slot-action-skip')).toBeOnTheScreen();
    await user.press(screen.getByTestId('slot-action-ate-else'));
    await user.press(screen.getByTestId('ate-else-cuisine-pizza'));
    await user.press(screen.getByTestId('ate-else-log-it'));
    await waitFor(() => expect(seen.logCustomMeal).toHaveLength(1));
    expect(seen.logCustomMeal?.[0]).toMatchObject({
      date: WEDNESDAY,
      name: 'Pizza · normal',
      mealType: 'breakfast',
      replacesSlot: { mealType: 'breakfast', slotIndex: 0 },
    });
    expect(await screen.findByText('Logged Pizza · normal for breakfast')).toBeOnTheScreen();
  });

  it('"Skipped it" skips that slot of that day', async () => {
    const seen: Record<string, unknown[]> = {};
    const user = userEvent.setup();
    await renderWithTrpc(<MealPlanScreen />, handlers({}, seen), testQueryClient());
    await user.press(await screen.findByTestId('plan-slot-actions-1'));
    await user.press(screen.getByTestId('slot-action-skip'));
    await waitFor(() => expect(seen.skipSlot).toHaveLength(1));
    expect(seen.skipSlot?.[0]).toEqual({
      date: WEDNESDAY,
      mealType: 'dinner',
      slotIndex: 1,
      rebalanceMode: 'preview',
    });
  });

  it('a later day has no overflow and its log is never read', async () => {
    const seen: Record<string, unknown[]> = {};
    const user = userEvent.setup();
    await renderWithTrpc(<MealPlanScreen />, handlers({}, seen), testQueryClient());
    await screen.findByTestId('plan-slot-actions-0');
    await user.press(screen.getByTestId('plan-day-4'));
    await waitFor(() => expect(screen.queryByTestId('plan-slot-actions-0')).toBeNull());
    expect(screen.getByTestId('plan-meal-breakfast')).toBeOnTheScreen();
    expect(seen.getDay?.every((i) => (i as { date: string }).date === WEDNESDAY)).toBe(true);
  });
});

describe('Plan day — swapped and skipped slots (WP-06)', () => {
  it('a replaced slot reads "You had: …", has no overflow, and the day total leaves its planned meal out', async () => {
    const seen: Record<string, unknown[]> = {};
    await renderWithTrpc(
      <MealPlanScreen />,
      handlers({ log: { loggedMeals: [replacement] } }, seen),
      testQueryClient(),
    );
    expect(await screen.findByTestId('plan-slot-replaced-0-text')).toHaveTextContent(
      'You had: Pizza · normal (≈ 775 kcal)',
    );
    expect(screen.queryByLabelText('More actions for Breakfast')).toBeNull();
    // Dinner is still to eat; breakfast's 450 kcal are no longer part of the plan.
    expect(screen.getByLabelText('More actions for Dinner')).toBeOnTheScreen();
    expect(dayTotal()).toHaveTextContent('540 kcal');
  });

  it('Remove puts the planned meal back', async () => {
    const seen: Record<string, unknown[]> = {};
    const user = userEvent.setup();
    await renderWithTrpc(
      <MealPlanScreen />,
      handlers({ log: { loggedMeals: [replacement] } }, seen),
      testQueryClient(),
    );
    await user.press(await screen.findByTestId('plan-slot-replaced-0-action'));
    await waitFor(() => expect(seen.deleteEntries).toHaveLength(1));
    expect(seen.deleteEntries?.[0]).toMatchObject({ date: WEDNESDAY, entryIds: ['e1'] });
    expect(await screen.findByText('Removed Pizza · normal')).toBeOnTheScreen();
  });

  it('a skipped slot reads "Skipped" with Undo, and leaves the day total', async () => {
    const seen: Record<string, unknown[]> = {};
    const user = userEvent.setup();
    await renderWithTrpc(
      <MealPlanScreen />,
      handlers({ skippedSlots: [{ mealType: 'dinner', slotIndex: 1 }] }, seen),
      testQueryClient(),
    );
    expect(await screen.findByTestId('plan-slot-skipped-1-text')).toHaveTextContent('Skipped');
    expect(dayTotal()).toHaveTextContent('450 kcal');
    await user.press(screen.getByTestId('plan-slot-skipped-1-action'));
    await waitFor(() => expect(seen.unskipSlot).toHaveLength(1));
    expect(seen.unskipSlot?.[0]).toEqual({ date: WEDNESDAY, mealType: 'dinner', slotIndex: 1 });
  });
});
