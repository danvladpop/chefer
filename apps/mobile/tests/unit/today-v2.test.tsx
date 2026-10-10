import { screen, userEvent, waitFor, within } from '@testing-library/react-native';
import type { NextWorkoutDto, RoutineDto, SessionSummaryDto } from '@chefer/types';
import { weekdayOf } from '@chefer/utils';
import HomeTab from '../../app/(main)/home';
import { localDate } from '../../src/features/gym/offline/ids';
import { renderWithTrpc, type Handlers } from './friends-core-harness';
import { testQueryClient } from './friends-profile-fixtures';
import { makeBootstrap } from './gym-fixtures';

// 10 Oct redesign — Today in the new shell (boards Home / HomeDone): gauge +
// macro rows, Next meal with Eaten / Cook now / Swap / Skip, "Your day" with
// its way into the tracker, Training planned vs done, and the weigh-in that
// turns into a weight widget once today is logged.

jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't close over imports
  const { useEffect } = require('react') as typeof import('react');
  return {
    router: { push: jest.fn(), replace: jest.fn(), navigate: jest.fn(), canGoBack: () => true },
    Link: ({ children }: { children: React.ReactNode }) => children,
    useFocusEffect: (effect: () => void) => useEffect(effect, [effect]),
  };
});
jest.mock('../../src/features/shell/add-action', () => ({
  AskChefAction: () => null,
  AddAction: () => null,
}));
jest.mock('../../src/features/shell/log-workout-sheet', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't close over imports
  const { Text: MockText } = require('react-native') as typeof import('react-native');
  return {
    LogWorkoutSheet: ({ visible }: { visible: boolean }) =>
      visible ? <MockText testID="log-workout-sheet-open">Log a workout</MockText> : null,
  };
});
jest.mock('../../src/hooks/use-is-premium', () => ({ useIsPremium: () => false }));
jest.mock('../../src/features/safety/migration-card', () => ({ MigrationCard: () => null }));
jest.mock('../../src/features/privacy/health-consent-notice', () => ({
  HealthConsentTodayNotice: () => null,
}));
jest.mock('../../src/features/tracker/rebalance-offer', () => ({ RebalanceOffer: () => null }));
jest.mock('../../src/features/tracker/rebalance-banner', () => ({ RebalanceBanner: () => null }));
jest.mock('../../src/features/tracker/rebalance-offer-store', () => ({
  ...jest.requireActual<typeof import('../../src/features/tracker/rebalance-offer-store')>(
    '../../src/features/tracker/rebalance-offer-store',
  ),
  recordRebalanceOutcome: jest.fn(),
}));
jest.mock('../../src/features/gym/reminders/use-gym-reminders', () => ({
  useGymReminders: () => undefined,
}));
jest.mock('../../src/features/gym/offline/active-session-store', () => ({
  useActiveSessionPausedAt: () => null,
}));
// T-26.2: these tests are about the save — consent is on record here.
jest.mock('../../src/features/privacy/use-health-consent', () => ({
  useHealthConsent: () => ({
    consented: true,
    requestHealthConsent: (run: () => void) => run(),
    healthConsentSheet: null,
  }),
}));

const mockStart = jest.fn();
jest.mock('../../src/features/gym/use-active-workout', () => ({
  useActiveWorkout: () => ({
    session: null,
    isActive: false,
    start: mockStart,
    resume: jest.fn(),
    finish: jest.fn(),
    discard: jest.fn(),
  }),
}));
let mockBootstrap: unknown;
jest.mock('../../src/features/gym/use-gym-bootstrap', () => ({
  ...jest.requireActual<typeof import('../../src/features/gym/use-gym-bootstrap')>(
    '../../src/features/gym/use-gym-bootstrap',
  ),
  useGymBootstrap: () => ({ data: mockBootstrap }),
}));

const { router } = jest.requireMock<{
  router: { push: jest.Mock; navigate: jest.Mock };
}>('expo-router');

const TODAY = localDate();

const recipe = (id: string, name: string, kcal: number) => ({
  id,
  name,
  description: 'A plan meal',
  imageUrl: null,
  kcal,
  servings: 1,
  prepTimeMins: 10,
  cookTimeMins: 15,
});

const LUNCH = {
  mealType: 'lunch',
  slotIndex: 1,
  dayOfWeek: 5,
  recipe: recipe('bowl', 'Chicken & Chickpea Bowl', 640),
};

const nutrition = {
  dailyCalorieTarget: 2100,
  plannedKcal: 1790,
  eatenKcal: 560,
  protein: { planned: 140, targetG: 140, eaten: 38 },
  carbs: { planned: 230, targetG: 230, eaten: 62 },
  fat: { planned: 70, targetG: 70, eaten: 18 },
};

function summary(over: Record<string, unknown> = {}) {
  return {
    user: { firstName: 'Dan', displayName: null },
    today: {
      date: 'Saturday 10 Oct',
      dayOfWeek: 5,
      slots: [
        { slotIndex: 0, mealType: 'breakfast', status: 'eaten' },
        { slotIndex: 1, mealType: 'lunch', status: 'planned' },
        { slotIndex: 2, mealType: 'dinner', status: 'planned' },
        { slotIndex: 3, mealType: 'snack', status: 'planned' },
      ],
    },
    planId: 'plan-1',
    jobs: [],
    weekPlan: [
      {
        dayOfWeek: 5,
        meals: [
          {
            mealType: 'breakfast',
            recipeId: 'oats',
            recipeName: 'Oats',
            imageUrl: null,
            kcal: 420,
          },
          { mealType: 'lunch', recipeId: 'bowl', recipeName: 'Bowl', imageUrl: null, kcal: 640 },
          {
            mealType: 'dinner',
            recipeId: 'salmon',
            recipeName: 'Salmon',
            imageUrl: null,
            kcal: 520,
          },
          { mealType: 'snack', recipeId: 'yog', recipeName: 'Yogurt', imageUrl: null, kcal: 210 },
        ],
      },
    ],
    nextMeal: LUNCH,
    tomorrowFirstMeal: null,
    restOfToday: [],
    recentFavourites: [],
    nutrition,
    weekReady: null,
    showNutritionCards: true,
    showNutrition: true,
    numbersMode: 'FULL',
    proteinGuide: { label: '30–40 g per meal' },
    ...over,
  };
}

const daysAgo = (n: number, hour = 8) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, 0, 0, 0);
  return d;
};

type Calls = Record<string, unknown[]>;

function api(
  over: Partial<Handlers> = {},
  weights = [{ id: 'w1', weightKg: 72.4, recordedAt: daysAgo(2) }],
) {
  const calls: Calls = {};
  const rec =
    (path: string, answer: unknown) =>
    (input: unknown): unknown => {
      (calls[path] ??= []).push(input);
      return answer;
    };
  const handlers: Handlers = {
    'dashboard.summary': () => summary(),
    'tracker.weightHistory': () => weights,
    'preferences.get': () => ({ chefProfile: { preferredUnits: 'METRIC', goal: null } }),
    'preferences.hasProfile': () => true,
    'tracker.logRecipe': rec('logRecipe', { rebalance: null }),
    'tracker.unlogRecipe': rec('unlogRecipe', {}),
    'tracker.skipSlot': rec('skipSlot', { log: {}, skippedSlots: [], rebalance: null }),
    'tracker.logWeight': rec('logWeight', {
      id: 'w-new',
      weightKg: 72.1,
      recordedAt: new Date(),
    }),
    ...over,
  };
  return { handlers, calls };
}

function routineFor(plannedWeekday: number): RoutineDto {
  return {
    id: 'r1',
    name: 'PPL',
    templateKey: null,
    isActive: true,
    nextDayId: 'day-a',
    version: 1,
    archived: false,
    updatedAt: '2026-09-01T00:00:00.000Z',
    days: [{ id: 'day-a', position: 0, name: 'Push A', plannedWeekday, exercises: [] }],
  };
}

const PUSH_A: NextWorkoutDto = {
  routineId: 'r1',
  dayId: 'day-a',
  dayName: 'Push A',
  isDeload: false,
  estimatedMin: 55,
  exercises: [],
};

function finishedToday(): SessionSummaryDto {
  const start = new Date();
  start.setHours(17, 44, 0, 0);
  const end = new Date(start);
  end.setHours(18, 40, 0, 0);
  return {
    id: 'session-1',
    name: 'Push A',
    routineDayId: 'day-a',
    status: 'COMPLETED',
    localDate: TODAY,
    startedAt: start.toISOString(),
    finishedAt: end.toISOString(),
    isDeload: false,
    exercises: [
      {
        exerciseId: 'bench',
        skipped: false,
        lastSetRir: null,
        sets: [
          { weightKg: 60, reps: 10, isWarmup: false, completed: true },
          { weightKg: 60, reps: 10, isWarmup: false, completed: true },
        ],
      },
      {
        exerciseId: 'squat',
        skipped: false,
        lastSetRir: null,
        sets: [{ weightKg: 80, reps: 8, isWarmup: false, completed: true }],
      },
    ],
  };
}

async function renderToday(over: Partial<Handlers> = {}, weights?: Parameters<typeof api>[1]) {
  const server = api(over, weights);
  const utils = await renderWithTrpc(<HomeTab />, server.handlers, testQueryClient());
  await screen.findByTestId('today-nutrition');
  return { ...utils, calls: server.calls };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockBootstrap = makeBootstrap({ profile: null });
});

describe('Today v2 — top bar', () => {
  it('titles the tab Today under a short date, with Stats into /progress', async () => {
    const user = userEvent.setup();
    await renderToday();
    expect(screen.getByText('Today')).toBeOnTheScreen();
    await user.press(screen.getByTestId('shell-stats'));
    expect(router.push).toHaveBeenCalledWith('/progress');
  });
});

describe('Today v2 — nutrition card', () => {
  it('shows eaten vs target on the gauge and the three macros', async () => {
    await renderToday();
    expect(screen.getByTestId('today-nutrition-gauge')).toHaveProp(
      'accessibilityLabel',
      '560 of 2,100 kcal eaten, 1,540 left',
    );
    expect(screen.getByTestId('today-nutrition-protein')).toHaveProp(
      'accessibilityLabel',
      'Protein, 38 of 140 grams',
    );
    expect(screen.getByTestId('today-nutrition-carbs')).toHaveProp(
      'accessibilityLabel',
      'Carbs, 62 of 230 grams',
    );
    expect(screen.getByTestId('today-nutrition-fat')).toHaveProp(
      'accessibilityLabel',
      'Fat, 18 of 70 grams',
    );
  });

  it("uses the training day's adjusted targets when the summary has them", async () => {
    await renderToday({
      'dashboard.summary': () =>
        summary({
          nutrition: {
            ...nutrition,
            adjustedTargets: { dailyCalorieTarget: 2400, proteinG: 160, carbsG: 280, fatG: 70 },
          },
        }),
    });
    expect(screen.getByTestId('today-nutrition-gauge')).toHaveProp(
      'accessibilityLabel',
      '560 of 2,400 kcal eaten, 1,840 left',
    );
  });

  it('protein-only users get protein alone — no gauge, no kcal on the meal', async () => {
    await renderToday({ 'dashboard.summary': () => summary({ numbersMode: 'PROTEIN_ONLY' }) });
    expect(screen.queryByTestId('today-nutrition-gauge')).toBeNull();
    expect(screen.getByTestId('today-nutrition-protein-only')).toHaveTextContent(/38 g/);
    expect(screen.queryByTestId('today-nutrition-carbs')).toBeNull();
    expect(screen.getByTestId('next-meal-meta')).not.toHaveTextContent(/kcal/);
  });

  it('hides the gauge and the weight card when nutrition is off (B-31)', async () => {
    const server = api({ 'dashboard.summary': () => summary({ showNutrition: false }) });
    await renderWithTrpc(<HomeTab />, server.handlers, testQueryClient());
    await screen.findByTestId('next-meal-card');
    expect(screen.queryByTestId('today-nutrition')).toBeNull();
    expect(screen.queryByTestId('today-weigh-in')).toBeNull();
  });
});

describe('Today v2 — next meal', () => {
  it('shows the meal type, name and "640 kcal · 25 min"', async () => {
    await renderToday();
    expect(screen.getByTestId('next-meal-type')).toHaveTextContent('Lunch');
    expect(screen.getByTestId('next-meal-name')).toHaveTextContent('Chicken & Chickpea Bowl');
    expect(screen.getByTestId('next-meal-meta')).toHaveTextContent('640 kcal · 25 min');
  });

  it('Eaten logs the planned slot through tracker.logRecipe and offers Undo', async () => {
    const user = userEvent.setup();
    const { calls } = await renderToday();
    await user.press(screen.getByTestId('next-meal-eaten'));
    await waitFor(() => expect(calls.logRecipe).toHaveLength(1));
    expect(calls.logRecipe?.[0]).toMatchObject({
      recipeId: 'bowl',
      mealType: 'lunch',
      slotIndex: 1,
      portionMultiplier: 1,
      date: TODAY,
    });
    await screen.findByText('Logged Chicken & Chickpea Bowl');
    // UX-FOOD-15: held on the meal just logged, so a second tap logs nothing.
    expect(screen.getByTestId('next-meal-eaten')).toHaveTextContent(/Eaten ✓/);
    expect(screen.getByTestId('next-meal-eaten')).toBeDisabled();
    await user.press(screen.getByText('Undo'));
    await waitFor(() => expect(calls.unlogRecipe).toHaveLength(1));
    expect(calls.unlogRecipe?.[0]).toMatchObject({
      recipeId: 'bowl',
      mealType: 'lunch',
      slotIndex: 1,
    });
  });

  it('Skip skips the slot through tracker.skipSlot', async () => {
    const user = userEvent.setup();
    const { calls } = await renderToday();
    await user.press(screen.getByTestId('next-meal-skip'));
    await waitFor(() => expect(calls.skipSlot).toHaveLength(1));
    expect(calls.skipSlot?.[0]).toMatchObject({ mealType: 'lunch', slotIndex: 1, date: TODAY });
  });

  it('Cook now opens cook mode; Swap opens the Meals day with the replace picker', async () => {
    const user = userEvent.setup();
    await renderToday();
    await user.press(screen.getByTestId('next-meal-cook'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/cook/[id]',
      params: { id: 'bowl', meal: 'lunch' },
    });
    await user.press(screen.getByTestId('next-meal-swap'));
    expect(router.push).toHaveBeenLastCalledWith({
      pathname: '/plan',
      params: expect.objectContaining({ week: '0', day: '5', swap: 'lunch' }) as unknown,
    });
  });

  it('with nothing planned, offers the Meals tab', async () => {
    const user = userEvent.setup();
    await renderToday({
      'dashboard.summary': () =>
        summary({ nextMeal: null, weekPlan: [], today: { date: 'x', dayOfWeek: 5 } }),
    });
    expect(screen.getByTestId('today-no-meal')).toHaveTextContent(/No meals planned yet\./);
    await user.press(screen.getByTestId('today-open-plan'));
    expect(router.navigate).toHaveBeenCalledWith('/plan');
  });
});

describe('Today v2 — your day', () => {
  it('draws one slot per planned meal with its state, and counts what was eaten', async () => {
    await renderToday();
    expect(screen.getByTestId('your-day-status')).toHaveTextContent('1 of 4 eaten');
    expect(screen.getByTestId('your-day-slot-breakfast-0')).toHaveProp(
      'accessibilityLabel',
      'Breakfast, 420 kcal, eaten',
    );
    expect(screen.getByTestId('your-day-slot-lunch-1')).toHaveProp(
      'accessibilityLabel',
      'Lunch, 640 kcal, next',
    );
    expect(screen.getByTestId('your-day-slot-dinner-2')).toHaveProp(
      'accessibilityLabel',
      'Dinner, 520 kcal, still to eat',
    );
  });

  it('"Open your day" goes to the tracker', async () => {
    const user = userEvent.setup();
    await renderToday();
    await user.press(screen.getByTestId('your-day-open'));
    expect(router.push).toHaveBeenCalledWith('/tracker');
  });
});

describe('Today v2 — weight', () => {
  it('not weighed today: a Weigh in card with the last entry, saving through tracker.logWeight', async () => {
    const user = userEvent.setup();
    const { calls } = await renderToday();
    const card = await screen.findByTestId('today-weigh-in');
    expect(within(card).getByTestId('today-weigh-in-last')).toHaveTextContent(/Last: 72.4 kg on /);
    expect(screen.queryByTestId('today-weight-widget')).toBeNull();
    await user.type(screen.getByTestId('today-weight-input'), '72.1');
    await user.press(screen.getByTestId('today-weight-save'));
    await waitFor(() => expect(calls.logWeight).toHaveLength(1));
    expect(calls.logWeight?.[0]).toEqual({ weightKg: 72.1 });
  });

  it('weighed in today: the weight widget, with the 30-day change, opening Stats', async () => {
    const user = userEvent.setup();
    await renderToday({}, [
      { id: 'w1', weightKg: 73, recordedAt: daysAgo(20) },
      { id: 'w2', weightKg: 72.2, recordedAt: daysAgo(0, 7) },
    ]);
    const widget = await screen.findByTestId('today-weight-widget');
    expect(screen.queryByTestId('today-weigh-in')).toBeNull();
    expect(screen.getByTestId('today-weight-latest')).toHaveTextContent('72.2 kg');
    expect(screen.getByTestId('today-weight-change')).toHaveTextContent('−0.8 kg in 30 days');
    expect(widget).toHaveTextContent(/Logged today/);
    await user.press(widget);
    expect(router.push).toHaveBeenCalledWith('/progress');
  });

  it('shows pounds for an imperial user', async () => {
    await renderToday(
      { 'preferences.get': () => ({ chefProfile: { preferredUnits: 'IMPERIAL', goal: null } }) },
      [{ id: 'w2', weightKg: 72.2, recordedAt: daysAgo(0, 7) }],
    );
    await waitFor(() =>
      expect(screen.getByTestId('today-weight-latest')).toHaveTextContent('159.2 lb'),
    );
  });
});

describe('Today v2 — training', () => {
  it('no gym profile: no training section at all', async () => {
    await renderToday();
    expect(screen.queryByTestId('today-training')).toBeNull();
  });

  it('planned today: day, length, Start workout starts it and Log a workout opens the sheet', async () => {
    const user = userEvent.setup();
    mockBootstrap = makeBootstrap({
      activeRoutine: routineFor(weekdayOf(TODAY)),
      nextWorkout: PUSH_A,
    });
    await renderToday();
    const card = screen.getByTestId('today-training-planned');
    expect(within(card).getByTestId('today-training-day')).toHaveTextContent('Push A');
    expect(card).toHaveTextContent(/0 exercises · ~55 min/);
    await user.press(screen.getByTestId('today-training-start'));
    expect(mockStart).toHaveBeenCalledWith({ kind: 'planned', workout: PUSH_A });
    expect(router.push).toHaveBeenCalledWith('/gym/workout');
    await user.press(screen.getByTestId('today-training-log'));
    expect(screen.getByTestId('log-workout-sheet-open')).toBeOnTheScreen();
  });

  it('done today: "Done at 18:40", Summary, and Duration / Sets / Exercises (no weigh-in → no kcal)', async () => {
    const user = userEvent.setup();
    mockBootstrap = makeBootstrap({
      activeRoutine: routineFor(weekdayOf(TODAY)),
      nextWorkout: PUSH_A,
      recentSessions: [finishedToday()],
    });
    await renderToday();
    expect(screen.queryByTestId('today-training-planned')).toBeNull();
    expect(screen.getByTestId('today-training-done-at')).toHaveTextContent('Done at 18:40');
    expect(screen.getByTestId('today-training-duration')).toHaveProp(
      'accessibilityLabel',
      'Duration: 56 min',
    );
    expect(screen.getByTestId('today-training-sets')).toHaveProp('accessibilityLabel', 'Sets: 3');
    expect(screen.queryByTestId('today-training-kcal')).toBeNull();
    expect(screen.getByTestId('today-training-exercises')).toHaveProp(
      'accessibilityLabel',
      'Exercises: 2',
    );
    await user.press(screen.getByTestId('today-training-summary'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/gym/summary/[id]',
      params: { id: 'session-1' },
    });
    await user.press(screen.getByTestId('today-training-log-another'));
    expect(screen.getByTestId('log-workout-sheet-open')).toBeOnTheScreen();
  });

  it('done today with a known bodyweight: an estimated kcal tile replaces Sets, and says so', async () => {
    mockBootstrap = makeBootstrap({
      activeRoutine: routineFor(weekdayOf(TODAY)),
      nextWorkout: PUSH_A,
      recentSessions: [finishedToday()],
      bodyweightKg: 80,
    });
    await renderToday();
    // 3 working sets cap the strength time at 25 of the 56 min: 3.5 MET × 80 kg × 25/60 h ≈ 117 → 120.
    const tile = screen.getByTestId('today-training-kcal');
    expect(tile).toHaveTextContent(/~120/);
    expect(tile).toHaveTextContent(/kcal burned \(est\.\)/);
    expect(tile).toHaveProp('accessibilityLabel', 'About 120 kilocalories burned, estimated');
    expect(tile).toHaveProp(
      'accessibilityHint',
      'Estimated from your body weight and workout time',
    );
    expect(screen.queryByTestId('today-training-sets')).toBeNull();
  });

  it('done today with kcal the user logged: "kcal you logged", their number unrounded', async () => {
    const session = finishedToday();
    mockBootstrap = makeBootstrap({
      activeRoutine: routineFor(weekdayOf(TODAY)),
      nextWorkout: PUSH_A,
      recentSessions: [
        {
          ...session,
          exercises: [
            {
              exerciseId: 'spin-class',
              skipped: false,
              lastSetRir: null,
              sets: [
                {
                  weightKg: 0,
                  reps: 0,
                  isWarmup: false,
                  completed: true,
                  durationSec: 45 * 60,
                  caloriesKcal: 313,
                },
              ],
            },
          ],
        },
      ],
    });
    await renderToday();
    const tile = screen.getByTestId('today-training-kcal');
    expect(tile).toHaveTextContent(/313/);
    expect(tile).toHaveTextContent(/kcal you logged/);
    expect(tile).toHaveProp('accessibilityLabel', '313 kilocalories burned, as you logged');
  });
});
