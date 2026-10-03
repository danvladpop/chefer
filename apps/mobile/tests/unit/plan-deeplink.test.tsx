import { act, screen, waitFor } from '@testing-library/react-native';
import MealPlanScreen from '../../app/(food)/meal-plan';
import { renderWithTrpc, trpcError, type Handlers } from './friends-core-harness';
import { testQueryClient } from './friends-profile-fixtures';

// UX-FOOD-18: Today's Tonight "Swap" links into Plan with `week=0&day=<n>&swap=dinner`
// (Plan used to open on NEXT week on Friday/Saturday evenings), and after
// midnight Plan reselects today instead of keeping yesterday.

// Fake the calendar only: faked timers/microtasks make React's scheduler and
// the query client hang intermittently.
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

let mockParams: Record<string, string> = {};

jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't close over imports
  const { useSyncExternalStore } = require('react') as typeof import('react');
  let focused = true;
  const listeners = new Set<() => void>();
  return {
    router: { push: jest.fn(), back: jest.fn() },
    // A live "is this tab focused" signal, like the real hook.
    useIsFocused: () =>
      useSyncExternalStore(
        (cb) => {
          listeners.add(cb);
          return () => listeners.delete(cb);
        },
        () => focused,
      ),
    __setFocused: (next: boolean) => {
      focused = next;
      listeners.forEach((l) => l());
    },
    useLocalSearchParams: () => mockParams,
  };
});
const setFocused = (next: boolean) =>
  jest.requireMock<{ __setFocused: (v: boolean) => void }>('expo-router').__setFocused(next);
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

const dinner = (id: string, name: string) => ({
  type: 'dinner',
  pinned: false,
  recipe: {
    id,
    name,
    imageUrl: null,
    prepTimeMins: 10,
    cookTimeMins: 20,
    servings: 2,
    nutritionInfo: { calories: 540, protein: 25, carbs: 60, fat: 12 },
    allergenWarnings: [],
  },
});

const planFor = (weekOffset: number) => ({
  planId: `p${weekOffset}`,
  weekStartDate: new Date().toISOString(),
  calorieTarget: 2000,
  days: Array.from({ length: 7 }, (_, dayOfWeek) => ({
    dayOfWeek,
    meals: [dinner(`r${dayOfWeek}`, `Dinner ${dayOfWeek}`)],
  })),
  trainingDays: [],
  tailoring: null,
});

const base = (more: Handlers = {}): Handlers => ({
  'mealPlan.getForWeek': (input) => planFor((input as { weekOffset: number }).weekOffset),
  'mealPlan.getShape': () => null,
  'targets.get': () => {
    throw trpcError('NOT_FOUND', 404);
  },
  'recipe.list': () => [],
  'recipe.listHiddenCount': () => ({ hiddenCount: 0 }),
  ...more,
});

const selectedDay = () =>
  [0, 1, 2, 3, 4, 5, 6].find(
    (i) =>
      (
        screen.getByTestId(`plan-day-${i}`).props as {
          accessibilityState?: { selected?: boolean };
        }
      ).accessibilityState?.selected === true,
  );

beforeEach(() => {
  mockParams = {};
  setFocused(true);
});
afterEach(() => jest.useRealTimers());

describe('Plan deep link from Tonight "Swap" (UX-FOOD-18)', () => {
  it('on a Friday evening it opens THIS week and the dinner picker, not next week', async () => {
    // Friday 4 Sep 2026, 19:00: Plan's own default is next week from 15:00.
    jest.useFakeTimers({
      now: new Date(2026, 8, 4, 19, 0),
      doNotFake: ONLY_THE_CLOCK,
    });
    mockParams = { week: '0', day: '4', swap: 'dinner', at: '1' };
    const { calls } = await renderWithTrpc(<MealPlanScreen />, base(), testQueryClient());

    expect(await screen.findByTestId('picker', {}, { timeout: 5000 })).toBeOnTheScreen();
    const weeks = calls
      .filter((c) => c.path === 'mealPlan.getForWeek')
      .map((c) => (c.input as { weekOffset: number }).weekOffset);
    expect(weeks).toEqual([0]);
    expect(selectedDay()).toBe(4);
    expect(screen.queryByTestId('plan-weekend-line')).toBeNull();
    // The picker is for tonight's dinner, not another slot.
    expect(screen.getAllByText(/Dinner 4/).length).toBeGreaterThanOrEqual(2);
  });

  it('ignores a malformed link and falls back to the default view', async () => {
    jest.useFakeTimers({
      now: new Date(2026, 8, 2, 10, 0), // Wednesday
      doNotFake: ONLY_THE_CLOCK,
    });
    mockParams = { week: '9', day: 'x', swap: 'brunch' };
    await renderWithTrpc(<MealPlanScreen />, base(), testQueryClient());
    await screen.findByTestId('plan-day-2', {}, { timeout: 5000 });
    expect(selectedDay()).toBe(2);
    expect(screen.queryByTestId('picker')).toBeNull();
  });
});

describe('Plan after midnight (UX-FOOD-18)', () => {
  it('reselects today when the screen is focused on a new date', async () => {
    jest.useFakeTimers({
      now: new Date(2026, 8, 1, 23, 50), // Tuesday 23:50
      doNotFake: ONLY_THE_CLOCK,
    });
    await renderWithTrpc(<MealPlanScreen />, base(), testQueryClient());
    await screen.findByTestId('plan-day-1', {}, { timeout: 5000 });
    expect(selectedDay()).toBe(1);

    // The tab goes to the background, midnight passes, the user comes back.
    await act(() => {
      setFocused(false);
      jest.setSystemTime(new Date(2026, 8, 2, 8, 0)); // Wednesday
    });
    await act(() => {
      setFocused(true);
    });
    await waitFor(() => expect(selectedDay()).toBe(2), { timeout: 5000 });
  });
});
