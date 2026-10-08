import { screen, userEvent, waitFor } from '@testing-library/react-native';
import { localDateStr } from '@chefer/utils';
import HomeScreen from '../../app/(food)/index';
import { HeroMealCard } from '../../src/features/dashboard/components/hero-meal-card';
import { TonightCard } from '../../src/features/dashboard/components/tonight-card';
import { renderWithTrpc, type Handlers } from './friends-core-harness';
import { testQueryClient } from './friends-profile-fixtures';

// WP-06 "Flexible eating" on Today: the hero and tonight cards get an overflow
// next to "I ate this" (Ate something else / Skipped it); a swapped meal reads
// "You had: …", a skipped one reads "Skipped", each with Remove / Undo.

jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't close over imports
  const { useEffect } = require('react') as typeof import('react');
  return {
    router: { push: jest.fn(), replace: jest.fn() },
    Link: ({ children }: { children: React.ReactNode }) => children,
    useFocusEffect: (effect: () => void) => useEffect(effect, [effect]),
  };
});
jest.mock('../../src/features/gym/components/mode-switch', () => ({ ModeSwitch: () => null }));
jest.mock('../../src/hooks/use-is-premium', () => ({ useIsPremium: () => false }));
jest.mock('../../src/features/premium/open-premium', () => ({ openPremium: jest.fn() }));
jest.mock('../../src/features/gym/today/todays-workout-card', () => ({
  TodaysWorkoutCard: () => null,
}));
jest.mock('../../src/features/coach/chef-review-banner', () => ({ ChefReviewBanner: () => null }));
jest.mock('../../src/features/safety/migration-card', () => ({ MigrationCard: () => null }));
jest.mock('../../src/features/privacy/health-consent-notice', () => ({
  HealthConsentTodayNotice: () => null,
}));
jest.mock('../../src/features/tracker/scan-meal-card', () => ({ ScanMealCard: () => null }));
jest.mock('../../src/features/safety/checked-for-chip', () => ({ CheckedForChip: () => null }));
jest.mock('../../src/features/tracker/rebalance-store', () => ({
  ...jest.requireActual<typeof import('../../src/features/tracker/rebalance-store')>(
    '../../src/features/tracker/rebalance-store',
  ),
  recordRebalance: jest.fn(),
}));

const TODAY = localDateStr();
const rebalance = { rebalanced: false, swaps: [], projectedDeviation: 0, planId: 'p' };

const recipe = (id: string, name: string, kcal = 600) => ({
  id,
  name,
  description: 'A plan meal',
  imageUrl: null,
  kcal,
  servings: 1,
  prepTimeMins: 10,
  cookTimeMins: 20,
});

const LUNCH = {
  mealType: 'lunch',
  slotIndex: 1,
  dayOfWeek: 2,
  recipe: recipe('bowl', 'Chicken Bowl'),
};

const summary = (slots: unknown[] = [], over: Record<string, unknown> = {}) => ({
  today: { date: 'Wednesday 2 Sep', dayOfWeek: 2, slots },
  weekPlan: [],
  weekGlance: undefined,
  weekReady: null,
  showNutrition: false,
  nutrition: undefined,
  tonight: null,
  tomorrow: null,
  nextMeal: LUNCH,
  restOfToday: [],
  recentFavourites: [],
  shopDue: null,
  ...over,
});

const REPLACED_BREAKFAST = {
  slotIndex: 0,
  mealType: 'breakfast',
  status: 'replaced',
  replacedBy: { entryId: 'e1', name: 'Pizza · normal', kcal: 775, protein: 30 },
};

type Server = { handlers: Handlers; seen: (path: string) => unknown[] };

/** A tiny in-memory API: records every call's input, answers like the real procedures. */
function server(day: Record<string, unknown>, slots: unknown[] = []): Server {
  const inputs: Record<string, unknown[]> = {};
  const record =
    (path: string, answer: (input: unknown) => unknown): ((input: unknown) => unknown) =>
    (input) => {
      (inputs[path] ??= []).push(input);
      return answer(input);
    };
  return {
    seen: (path) => inputs[path] ?? [],
    handlers: {
      'dashboard.summary': () => summary(slots),
      'tracker.getDay': () => day,
      'tracker.recents': () => [],
      'tracker.logCustomMeal': record('logCustomMeal', () => ({
        log: {},
        rebalance,
        entryId: 'new-entry',
      })),
      'tracker.deleteEntries': record('deleteEntries', () => ({})),
      'tracker.restoreCustomMeal': record('restoreCustomMeal', () => ({})),
      'tracker.skipSlot': record('skipSlot', () => ({ log: {}, skippedSlots: [], rebalance })),
      'tracker.unskipSlot': record('unskipSlot', () => ({ log: {}, skippedSlots: [] })),
    },
  };
}
const call = (s: Server, path: string) => s.seen(path);
const dayWithReplacement = {
  log: {
    loggedMeals: [
      {
        entryId: 'e1',
        custom: { name: 'Pizza · normal', estimatedBy: 'manual' },
        mealType: 'breakfast',
        replacesSlot: { mealType: 'breakfast', slotIndex: 0 },
        portionMultiplier: 1,
        kcal: 775,
        protein: 30,
        carbs: 12,
        fat: 9,
      },
    ],
    totalKcal: 775,
    totalProtein: 30,
    totalCarbs: 12,
    totalFat: 9,
  },
  skippedSlots: [],
  plannedMeals: [],
  offPlanLogged: [],
};

beforeEach(() => {
  jest.spyOn(Date.prototype, 'getHours').mockReturnValue(9);
});
afterEach(() => jest.restoreAllMocks());

describe('Today — overflow on the hero card (WP-06)', () => {
  it('has "More actions for Lunch" next to "I ate this", with both actions', async () => {
    const user = userEvent.setup();
    await renderWithTrpc(<HomeScreen />, server({}).handlers, testQueryClient());
    await screen.findByTestId('hero-meal-card');
    expect(screen.getByTestId('today-ate-this')).toBeOnTheScreen();
    expect(screen.getByLabelText('More actions for Lunch')).toBeOnTheScreen();
    await user.press(screen.getByTestId('today-slot-actions'));
    expect(screen.getByTestId('slot-action-ate-else')).toBeOnTheScreen();
    expect(screen.getByTestId('slot-action-skip')).toBeOnTheScreen();
  });

  it('quick estimate logs a replacement for that slot, refreshes Today, and Undo deletes it', async () => {
    const user = userEvent.setup();
    const api = server({});
    const { paths } = await renderWithTrpc(<HomeScreen />, api.handlers, testQueryClient());
    await screen.findByTestId('hero-meal-card');
    const summariesBefore = paths().filter((p) => p === 'dashboard.summary').length;
    await user.press(screen.getByTestId('today-slot-actions'));
    await user.press(screen.getByTestId('slot-action-ate-else'));
    await user.press(screen.getByTestId('ate-else-cuisine-shawarma'));
    await user.press(screen.getByTestId('ate-else-log-it'));
    await waitFor(() => expect(call(api, 'logCustomMeal')).toHaveLength(1));
    expect(call(api, 'logCustomMeal')[0]).toMatchObject({
      date: TODAY,
      name: 'Shawarma · normal',
      estimatedBy: 'manual',
      mealType: 'lunch',
      kcal: 775,
      protein: 40,
      unknownMacros: ['carbs', 'fat'],
      replacesSlot: { mealType: 'lunch', slotIndex: 1 },
    });
    expect(await screen.findByText('Logged Shawarma · normal for lunch')).toBeOnTheScreen();
    // Today re-reads its summary, so the hero moves on past the replaced slot.
    await waitFor(() =>
      expect(paths().filter((p) => p === 'dashboard.summary').length).toBeGreaterThan(
        summariesBefore,
      ),
    );
    await user.press(screen.getByText('Undo'));
    await waitFor(() => expect(call(api, 'deleteEntries')).toHaveLength(1));
    expect(call(api, 'deleteEntries')[0]).toMatchObject({ date: TODAY, entryIds: ['new-entry'] });
  });

  it('"Skipped it" skips the slot and Undo takes it back — no judgement copy', async () => {
    const user = userEvent.setup();
    const api = server({});
    await renderWithTrpc(<HomeScreen />, api.handlers, testQueryClient());
    await screen.findByTestId('hero-meal-card');
    await user.press(screen.getByTestId('today-slot-actions'));
    await user.press(screen.getByTestId('slot-action-skip'));
    await waitFor(() => expect(call(api, 'skipSlot')).toHaveLength(1));
    expect(call(api, 'skipSlot')[0]).toEqual({
      date: TODAY,
      mealType: 'lunch',
      slotIndex: 1,
      rebalanceMode: 'preview',
    });
    expect(await screen.findByText('Lunch skipped')).toBeOnTheScreen();
    await user.press(screen.getByText('Undo'));
    await waitFor(() => expect(call(api, 'unskipSlot')).toHaveLength(1));
    expect(call(api, 'unskipSlot')[0]).toEqual({ date: TODAY, mealType: 'lunch', slotIndex: 1 });
  });

  it('a failed skip says why in plain words', async () => {
    const user = userEvent.setup();
    const api = server({});
    api.handlers['tracker.skipSlot'] = () => {
      throw new Error('Network request failed');
    };
    await renderWithTrpc(<HomeScreen />, api.handlers, testQueryClient());
    await screen.findByTestId('hero-meal-card');
    await user.press(screen.getByTestId('today-slot-actions'));
    await user.press(screen.getByTestId('slot-action-skip'));
    expect(await screen.findByText(/Couldn't skip lunch\./)).toBeOnTheScreen();
  });
});

describe('Today — swapped and skipped meals (WP-06)', () => {
  it('a replaced meal reads "You had: …" and Remove brings it back, with an Undo', async () => {
    const user = userEvent.setup();
    const api = server(dayWithReplacement, [REPLACED_BREAKFAST]);
    await renderWithTrpc(<HomeScreen />, api.handlers, testQueryClient());
    expect(await screen.findByTestId('today-slot-breakfast-0-text')).toHaveTextContent(
      'You had: Pizza · normal (≈ 775 kcal)',
    );
    await user.press(screen.getByTestId('today-slot-breakfast-0-action'));
    await waitFor(() => expect(call(api, 'deleteEntries')).toHaveLength(1));
    expect(call(api, 'deleteEntries')[0]).toMatchObject({ entryIds: ['e1'] });
    expect(await screen.findByText('Removed Pizza · normal')).toBeOnTheScreen();
    await user.press(screen.getByText('Undo'));
    await waitFor(() => expect(call(api, 'restoreCustomMeal')).toHaveLength(1));
    expect(call(api, 'restoreCustomMeal')[0]).toMatchObject({
      entry: {
        entryId: 'e1',
        mealType: 'breakfast',
        kcal: 775,
        carbs: 12,
        replacesSlot: { mealType: 'breakfast', slotIndex: 0 },
      },
    });
  });

  it('a skipped meal reads "Skipped" and its Undo un-skips it', async () => {
    const user = userEvent.setup();
    const api = server({}, [{ slotIndex: 0, mealType: 'breakfast', status: 'skipped' }]);
    await renderWithTrpc(<HomeScreen />, api.handlers, testQueryClient());
    expect(await screen.findByTestId('today-slot-breakfast-0-text')).toHaveTextContent('Skipped');
    await user.press(screen.getByTestId('today-slot-breakfast-0-action'));
    await waitFor(() => expect(call(api, 'unskipSlot')).toHaveLength(1));
    expect(call(api, 'unskipSlot')[0]).toEqual({
      date: TODAY,
      mealType: 'breakfast',
      slotIndex: 0,
    });
  });

  it('planned and eaten slots add no note', async () => {
    const api = server({}, [
      { slotIndex: 0, mealType: 'breakfast', status: 'eaten' },
      { slotIndex: 1, mealType: 'lunch', status: 'planned' },
    ]);
    await renderWithTrpc(<HomeScreen />, api.handlers, testQueryClient());
    await screen.findByTestId('hero-meal-card');
    expect(screen.queryByTestId('today-slot-notes')).toBeNull();
  });
});

describe('HeroMealCard / TonightCard overflow (WP-06)', () => {
  const dinnerMeal = (done: boolean) => ({
    planId: 'p1',
    dayOfWeek: 2,
    slotIndex: 2,
    mealType: 'dinner',
    done,
    recipe: recipe('salmon', 'Sheet-Pan Salmon', 520),
  });

  it('the hero card has no overflow unless the screen wires it', async () => {
    await renderWithTrpc(<HeroMealCard meal={LUNCH} isTomorrow={false} />, {}, testQueryClient());
    expect(screen.queryByTestId('today-slot-actions')).toBeNull();
  });

  it('the hero card hands the meal over when the overflow is pressed', async () => {
    const onSlotActions = jest.fn();
    const user = userEvent.setup();
    await renderWithTrpc(
      <HeroMealCard meal={LUNCH} isTomorrow={false} onSlotActions={onSlotActions} />,
      {},
      testQueryClient(),
    );
    await user.press(screen.getByLabelText('More actions for Lunch'));
    expect(onSlotActions).toHaveBeenCalledWith(expect.objectContaining({ mealType: 'lunch' }));
  });

  it("tomorrow's hero card has no overflow", async () => {
    await renderWithTrpc(
      <HeroMealCard meal={LUNCH} isTomorrow onSlotActions={jest.fn()} />,
      {},
      testQueryClient(),
    );
    expect(screen.queryByTestId('today-slot-actions')).toBeNull();
  });

  it('the tonight card has "More actions for Dinner" beside "I ate this"', async () => {
    const onSlotActions = jest.fn();
    const user = userEvent.setup();
    await renderWithTrpc(
      <TonightCard
        meal={dinnerMeal(false)}
        showNutrition
        onLogged={jest.fn()}
        onSlotActions={onSlotActions}
      />,
      {},
      testQueryClient(),
    );
    expect(screen.getByTestId('tonight-ate-this')).toBeOnTheScreen();
    await user.press(screen.getByLabelText('More actions for Dinner'));
    expect(onSlotActions).toHaveBeenCalledTimes(1);
  });

  it('a replaced dinner reads "Dinner done · You had: …" with Remove', async () => {
    const onRemove = jest.fn();
    const user = userEvent.setup();
    await renderWithTrpc(
      <TonightCard
        meal={dinnerMeal(true)}
        showNutrition
        onLogged={jest.fn()}
        slot={{ status: 'replaced', name: 'Shawarma · normal', kcal: 775, onRemove }}
      />,
      { 'recipe.getMyRating': () => null },
      testQueryClient(),
    );
    expect(screen.getByTestId('tonight-replaced-text')).toHaveTextContent(
      'Dinner done · You had: Shawarma · normal (≈ 775 kcal)',
    );
    await user.press(screen.getByTestId('tonight-replaced-action'));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('a skipped dinner reads "Skipped" with Undo, and is not offered for cooking', async () => {
    const onUndo = jest.fn();
    const user = userEvent.setup();
    await renderWithTrpc(
      <TonightCard
        meal={dinnerMeal(false)}
        showNutrition
        onLogged={jest.fn()}
        slot={{ status: 'skipped', onUndo }}
      />,
      {},
      testQueryClient(),
    );
    expect(screen.getByTestId('tonight-skipped-text')).toHaveTextContent('Dinner · Skipped');
    expect(screen.queryByTestId('tonight-cook-it')).toBeNull();
    await user.press(screen.getByTestId('tonight-skipped-action'));
    expect(onUndo).toHaveBeenCalledTimes(1);
  });
});

describe('Today in the evening — dinner swapped or skipped (WP-06)', () => {
  const tonight = (done: boolean) => ({
    planId: 'p1',
    dayOfWeek: 2,
    slotIndex: 2,
    mealType: 'dinner',
    done,
    recipe: recipe('salmon', 'Sheet-Pan Salmon', 520),
  });
  const evening = (slots: unknown[], done: boolean): Handlers => ({
    ...server({}, slots).handlers,
    'dashboard.summary': () => summary(slots, { tonight: tonight(done), nextMeal: null }),
    'recipe.getMyRating': () => null,
  });

  it('a skipped dinner collapses to its own row (no cook button) and shows once', async () => {
    jest.spyOn(Date.prototype, 'getHours').mockReturnValue(18);
    await renderWithTrpc(
      <HomeScreen />,
      evening([{ slotIndex: 2, mealType: 'dinner', status: 'skipped' }], false),
      testQueryClient(),
    );
    expect(await screen.findByTestId('tonight-skipped-text')).toHaveTextContent('Dinner · Skipped');
    expect(screen.queryByTestId('tonight-cook-it')).toBeNull();
    // The tonight row already says it: no second note for the same slot.
    expect(screen.queryByTestId('today-slot-notes')).toBeNull();
  });

  it('a replaced dinner reads what you had, not the planned recipe', async () => {
    jest.spyOn(Date.prototype, 'getHours').mockReturnValue(18);
    await renderWithTrpc(
      <HomeScreen />,
      evening(
        [
          {
            slotIndex: 2,
            mealType: 'dinner',
            status: 'replaced',
            replacedBy: { entryId: 'e9', name: 'Burger · big', kcal: 1300, protein: 50 },
          },
        ],
        true,
      ),
      testQueryClient(),
    );
    expect(await screen.findByTestId('tonight-replaced-text')).toHaveTextContent(
      'Dinner done · You had: Burger · big (≈ 1,300 kcal)',
    );
    expect(screen.queryByText(/Sheet-Pan Salmon/)).toBeNull();
  });
});

describe('Ate something else → Describe it (WP-06)', () => {
  it('hands over to the Log sheet aimed at the slot; what it logs replaces that slot, with Undo', async () => {
    const user = userEvent.setup();
    const api = server({});
    await renderWithTrpc(<HomeScreen />, api.handlers, testQueryClient());
    await screen.findByTestId('hero-meal-card');
    await user.press(screen.getByTestId('today-slot-actions'));
    await user.press(screen.getByTestId('slot-action-ate-else'));
    await user.press(screen.getByTestId('ate-else-describe'));

    // The first sheet leaves, then the Log sheet opens for lunch — no meal picker.
    expect(await screen.findByTestId('log-sheet-title', {}, { timeout: 3000 })).toHaveTextContent(
      'Ate something else',
    );
    expect(screen.queryByTestId('log-sheet-meal')).toBeNull();
    await user.press(screen.getByTestId('log-sheet-manual'));
    expect(screen.queryByTestId('quick-add-meal')).toBeNull();
    await user.type(screen.getByTestId('quick-add-name'), 'Leftover lasagne');
    await user.type(screen.getByTestId('quick-add-kcal'), '640');
    await user.press(screen.getByTestId('quick-add-submit'));
    await waitFor(() => expect(call(api, 'logCustomMeal')).toHaveLength(1));
    expect(call(api, 'logCustomMeal')[0]).toMatchObject({
      date: TODAY,
      name: 'Leftover lasagne',
      mealType: 'lunch',
      kcal: 640,
      replacesSlot: { mealType: 'lunch', slotIndex: 1 },
    });
    expect(await screen.findByText('Logged Leftover lasagne for lunch')).toBeOnTheScreen();
    await user.press(screen.getByText('Undo'));
    await waitFor(() => expect(call(api, 'deleteEntries')).toHaveLength(1));
    expect(call(api, 'deleteEntries')[0]).toMatchObject({ entryIds: ['new-entry'] });
  });
});

describe('Ate something else → Recent (WP-06)', () => {
  it('one tap on a recent entry replaces the slot with its numbers; a recipe is logged as a custom entry', async () => {
    const user = userEvent.setup();
    const api = server({});
    api.handlers['tracker.recents'] = () => [
      {
        key: 'recipe:r1',
        recipeId: 'r1',
        name: 'Protein shake',
        imageUrl: null,
        mealType: 'snack',
        kcal: 180,
        protein: 30,
        carbs: 5,
        fat: 2,
        portionMultiplier: 1,
        count: 4,
        lastLoggedAt: '2026-09-25',
      },
    ];
    await renderWithTrpc(<HomeScreen />, api.handlers, testQueryClient());
    await screen.findByTestId('hero-meal-card');
    await user.press(screen.getByTestId('today-slot-actions'));
    await user.press(screen.getByTestId('slot-action-ate-else'));
    await user.press(await screen.findByTestId('ate-else-recent-recipe:r1'));
    await waitFor(() => expect(call(api, 'logCustomMeal')).toHaveLength(1));
    expect(call(api, 'logCustomMeal')[0]).toMatchObject({
      name: 'Protein shake',
      estimatedBy: 'manual',
      mealType: 'lunch',
      kcal: 180,
      protein: 30,
      carbs: 5,
      fat: 2,
      replacesSlot: { mealType: 'lunch', slotIndex: 1 },
    });
  });
});
