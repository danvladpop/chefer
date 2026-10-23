import {
  clearTodayWidget,
  setTodayWidgetModuleForTests,
  writeTodayWidget,
} from '../../src/features/widget/today-widget';
import { buildTodayWidgetSnapshot } from '../../src/features/widget/today-widget-snapshot';
import type { RouterOutputs } from '../../src/lib/trpc';

// C4: the home-screen widget shows the next planned meal and what is left of
// today's targets — following the same numbers rules as Today — and never
// outlives a sign-out. Older binaries (no native module) are untouched.

type Summary = RouterOutputs['dashboard']['summary'];

const recipe = (name: string, kcal: number) => ({
  id: name,
  name,
  description: '',
  imageUrl: null,
  kcal,
  servings: 1,
  prepTimeMins: 10,
});

function summary(over: Record<string, unknown> = {}): Summary {
  return {
    weekPlan: [{ dayOfWeek: 4, meals: [] }],
    nextMeal: { mealType: 'lunch', slotIndex: 1, recipe: recipe('Chicken & Chickpea Bowl', 640) },
    tomorrowFirstMeal: null,
    nutrition: {
      dailyCalorieTarget: 2100,
      plannedKcal: 1790,
      eatenKcal: 560,
      protein: { planned: 140, targetG: 140, eaten: 38 },
      carbs: { planned: 230, targetG: 230, eaten: 62 },
      fat: { planned: 70, targetG: 70, eaten: 18 },
    },
    showNutrition: true,
    numbersMode: 'FULL',
    ...over,
  } as unknown as Summary;
}

const DATE = '2026-10-23';
const URL = 'chefer://home';

describe('buildTodayWidgetSnapshot', () => {
  it('shows the next meal and the kcal and protein left', () => {
    expect(buildTodayWidgetSnapshot(summary(), DATE, URL)).toEqual({
      v: 1,
      date: DATE,
      eyebrow: 'Next · Lunch',
      title: 'Chicken & Chickpea Bowl',
      detail: '1,540 kcal · 102 g protein left',
      url: URL,
    });
  });

  it('uses the training-day targets when the API bumped them', () => {
    const s = summary();
    const bumped = summary({
      nutrition: {
        ...s.nutrition,
        adjustedTargets: { dailyCalorieTarget: 2400, proteinG: 160, carbsG: 260, fatG: 75 },
      },
    });
    expect(buildTodayWidgetSnapshot(bumped, DATE, URL).detail).toBe(
      '1,840 kcal · 122 g protein left',
    );
  });

  it('shows protein only for protein-only users', () => {
    const s = buildTodayWidgetSnapshot(summary({ numbersMode: 'PROTEIN_ONLY' }), DATE, URL);
    expect(s.detail).toBe('102 g protein left');
  });

  it('shows no numbers when nutrition is off or numbers are hidden', () => {
    expect(
      buildTodayWidgetSnapshot(summary({ showNutrition: false }), DATE, URL).detail,
    ).toBeNull();
    expect(buildTodayWidgetSnapshot(summary({ numbersMode: 'NONE' }), DATE, URL).detail).toBeNull();
  });

  it('never shows a negative amount left', () => {
    const s = summary();
    const over = summary({
      nutrition: {
        ...s.nutrition,
        eatenKcal: 2500,
        protein: { ...s.nutrition.protein, eaten: 150 },
      },
    });
    expect(buildTodayWidgetSnapshot(over, DATE, URL).detail).toBe('0 kcal · 0 g protein left');
  });

  it("falls back to tomorrow's first meal, then to a nudge", () => {
    const tomorrow = summary({
      nextMeal: null,
      tomorrowFirstMeal: { mealType: 'breakfast', recipe: recipe('Oats', 420) },
    });
    expect(buildTodayWidgetSnapshot(tomorrow, DATE, URL)).toMatchObject({
      eyebrow: 'Tomorrow · Breakfast',
      title: 'Oats',
    });
    expect(buildTodayWidgetSnapshot(summary({ nextMeal: null }), DATE, URL).title).toBe(
      'No more meals planned',
    );
    expect(
      buildTodayWidgetSnapshot(summary({ nextMeal: null, weekPlan: [] }), DATE, URL).title,
    ).toBe('Plan your week in Chefer');
  });
});

describe('widget bridge', () => {
  afterEach(() => setTodayWidgetModuleForTests(undefined));

  it('writes the snapshot once per change and clears it on sign-out', async () => {
    const setTodaySnapshot = jest.fn<Promise<void>, [string | null]>(() => Promise.resolve());
    setTodayWidgetModuleForTests({ setTodaySnapshot });
    const snapshot = buildTodayWidgetSnapshot(summary(), DATE, URL);

    await writeTodayWidget(snapshot);
    await writeTodayWidget(snapshot); // unchanged → no native call
    expect(setTodaySnapshot).toHaveBeenCalledTimes(1);
    expect(JSON.parse(setTodaySnapshot.mock.calls[0]?.[0] ?? 'null')).toEqual(snapshot);

    await clearTodayWidget();
    expect(setTodaySnapshot).toHaveBeenLastCalledWith(null);
  });

  it('does nothing on a binary without the module', async () => {
    setTodayWidgetModuleForTests(null);
    await expect(
      writeTodayWidget(buildTodayWidgetSnapshot(summary(), DATE, URL)),
    ).resolves.toBeUndefined();
    await expect(clearTodayWidget()).resolves.toBeUndefined();
  });
});
