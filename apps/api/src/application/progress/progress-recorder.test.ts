import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DailyLog } from '@chefer/database';
import { cookCandidate, mealCandidate, welcomeCandidate } from '@chefer/utils';
import { makeWorld, tick, USER } from './__test__/fakes.js';
import { ProgressRecorder } from './progress-recorder.js';

// The recorder is the one write path: score → append → derive → unlock. These
// run it over in-memory repositories with the clock pinned.

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-10-22T10:00:00.000Z') });
});
afterEach(() => {
  vi.useRealTimers();
});

const meal = (date: string, n = 1, onPlan = false) =>
  mealCandidate({
    date,
    sourceId: `${date}:custom:m${n}`,
    mealType: 'lunch',
    onPlan,
  });

const cook = (n: number, date: string, recipeId = `r${n}`) =>
  cookCandidate({
    cookId: `cook-${n}`,
    localDate: date,
    recipeId,
    recipeName: 'Dish',
    firstTime: false,
    cookCount: n,
  });

describe('ProgressRecorder.record', () => {
  it('pays a candidate once: the same input twice is one append', async () => {
    const w = makeWorld();
    const recorder = new ProgressRecorder(w.deps);
    const first = await recorder.record(USER, [meal('2026-10-22')]);
    const second = await recorder.record(USER, [meal('2026-10-22')]);

    expect(first.inserted).toHaveLength(1);
    expect(second.inserted).toHaveLength(0);
    expect(w.ledger.rows).toHaveLength(1);
    expect(w.ledger.total).toBe(5);
  });

  it('dedupes a repeated key inside one call', async () => {
    const w = makeWorld();
    const recorder = new ProgressRecorder(w.deps);
    await recorder.record(USER, [meal('2026-10-22'), meal('2026-10-22')]);
    expect(w.ledger.rows).toHaveLength(1);
  });

  it('halves what a day earns above the soft cap, and never above it for bonuses', async () => {
    const w = makeWorld();
    const recorder = new ProgressRecorder(w.deps);
    // 4 cooks = 100 XP, 2 more = 50: the day is at 150, so a 40 XP workout counts for 20.
    await recorder.record(
      USER,
      [1, 2, 3, 4, 5, 6].map((n) => cook(n, '2026-10-20')),
    );
    expect(w.ledger.total).toBe(150);
    await recorder.record(USER, [
      {
        kind: 'WORKOUT_COMPLETED',
        sourceId: 's1',
        localDate: '2026-10-20',
        lines: [{ code: 'WORKOUT_DONE', xp: 40 }],
        meta: {},
      },
    ]);
    expect(w.ledger.ofKind('WORKOUT_COMPLETED')[0]?.xp).toBe(20);
    expect(w.ledger.total).toBe(170);
  });

  it('pays WEEK_GOAL once, dated on the day the goal was reached', async () => {
    const w = makeWorld();
    const recorder = new ProgressRecorder(w.deps);
    // The default goal is 3 active days. 2026-10-19 is a Monday.
    await recorder.record(USER, [meal('2026-10-19')]);
    await recorder.record(USER, [meal('2026-10-20')]);
    expect(w.ledger.ofKind('WEEK_GOAL')).toHaveLength(0);
    await recorder.record(USER, [meal('2026-10-21')]);
    await recorder.record(USER, [meal('2026-10-22')]);

    const goals = w.ledger.ofKind('WEEK_GOAL');
    expect(goals).toHaveLength(1);
    expect(goals[0]).toMatchObject({ sourceId: '2026-10-19', localDate: '2026-10-21', xp: 50 });
  });

  it('inserts an unlock once, however many records cross the threshold', async () => {
    const w = makeWorld();
    const recorder = new ProgressRecorder(w.deps);
    const days = Array.from({ length: 12 }, (_, i) => `2026-09-${String(i + 1).padStart(2, '0')}`);
    for (const [i, date] of days.entries()) await recorder.record(USER, [cook(i + 1, date)]);

    const homeChef = w.unlocks.rows.filter((u) => u.achievementId === 'HOME_CHEF');
    expect(homeChef.map((u) => u.tier)).toEqual([1]);
    // Recording an already-held state again adds nothing.
    await recorder.record(USER, [cook(13, '2026-09-13')]);
    expect(w.unlocks.rows.filter((u) => u.achievementId === 'HOME_CHEF')).toHaveLength(1);
  });

  it('returns the level a record crossed, with the unlocks it earned', async () => {
    const w = makeWorld();
    const recorder = new ProgressRecorder(w.deps);
    const res = await recorder.record(USER, [welcomeCandidate('2026-10-22')]);
    expect(res.totalAfter - res.totalBefore).toBe(28);
    expect(res.unlocks.map((u) => u.achievementId)).toEqual(['WELCOME']);
  });

  it('pays TODAYS_THREE once the stored quest set is complete', async () => {
    const w = makeWorld();
    const recorder = new ProgressRecorder(w.deps);
    await w.questDays.createIfAbsent(USER, '2026-10-22', [
      { id: 'LOG_ANY', kind: 'LOG_ANY', xp: 5, done: false },
    ]);

    await recorder.record(USER, [cook(1, '2026-10-22')]);
    expect(w.ledger.ofKind('TODAYS_THREE')).toHaveLength(0);
    await recorder.record(USER, [meal('2026-10-22')]);
    await recorder.record(USER, [meal('2026-10-22', 2)]);

    expect(w.ledger.ofKind('TODAYS_THREE')).toHaveLength(1);
    expect(w.ledger.ofKind('TODAYS_THREE')[0]?.xp).toBe(40);
  });

  it('scores an old localDate on that date, not on today (an offline doc)', async () => {
    const w = makeWorld();
    const recorder = new ProgressRecorder(w.deps);
    await recorder.record(USER, [
      { ...cook(1, '2026-10-03'), kind: 'WORKOUT_COMPLETED', sourceId: 'old-session' },
    ]);
    expect(w.ledger.rows[0]?.localDate).toBe('2026-10-03');
  });

  it('refresh pays a week a lowered goal now completes', async () => {
    const w = makeWorld();
    const recorder = new ProgressRecorder(w.deps);
    await recorder.record(USER, [meal('2026-10-19'), meal('2026-10-20')]);
    expect(w.ledger.ofKind('WEEK_GOAL')).toHaveLength(0);

    await w.states.update(USER, { goalHistory: [{ fromWeek: '2026-10-19', goal: 2 }] });
    const res = await recorder.refresh(USER, '2026-10-22');
    expect(res.inserted.map((r) => r.kind)).toEqual(['WEEK_GOAL']);
  });
});

describe('ProgressRecorder.onShoppingToggled', () => {
  it('records SHOP_DONE only when every item is checked', async () => {
    let unchecked = 2;
    const w = makeWorld({
      shopping: { progress: () => Promise.resolve({ total: 5, unchecked }) },
    });
    const recorder = new ProgressRecorder(w.deps);

    await recorder.onShoppingToggled(USER, 'plan1', '2026-10-22');
    expect(w.ledger.ofKind('SHOP_DONE')).toHaveLength(0);

    unchecked = 0;
    await recorder.onShoppingToggled(USER, 'plan1', '2026-10-22');
    await recorder.onShoppingToggled(USER, 'plan1', '2026-10-22');
    expect(w.ledger.ofKind('SHOP_DONE')).toHaveLength(1);
    expect(w.ledger.ofKind('SHOP_DONE')[0]?.key).toBe('SHOP_DONE:plan1');
  });

  it('falls back to the profile time zone for the day', async () => {
    const w = makeWorld({
      shopping: { progress: () => Promise.resolve({ total: 1, unchecked: 0 }) },
      profiles: {
        // 10:00 UTC on the 22nd is already the 22nd in Auckland (UTC+13).
        findByUserId: () => Promise.resolve({ timeZone: 'Pacific/Auckland' } as never),
      },
      now: () => new Date('2026-10-22T20:00:00.000Z'),
    });
    await new ProgressRecorder(w.deps).onShoppingToggled(USER, 'plan1', undefined);
    expect(w.ledger.ofKind('SHOP_DONE')[0]?.localDate).toBe('2026-10-23');
  });

  it('does nothing for an empty list', async () => {
    const w = makeWorld({
      shopping: { progress: () => Promise.resolve({ total: 0, unchecked: 0 }) },
    });
    await new ProgressRecorder(w.deps).onShoppingToggled(USER, 'plan1', '2026-10-22');
    expect(w.ledger.rows).toHaveLength(0);
  });
});

describe('ProgressRecorder.onDayChanged', () => {
  const log = (loggedMeals: unknown[], over: Partial<DailyLog> = {}): DailyLog =>
    ({
      id: 'l1',
      userId: USER,
      date: new Date('2026-10-22T00:00:00Z'),
      loggedMeals,
      totalKcal: 1800,
      totalProtein: 60,
      totalCarbs: 200,
      totalFat: 60,
      skippedSlots: [],
      updatedAt: tick(),
      ...over,
    }) as unknown as DailyLog;

  const custom = (n: number) => ({
    entryId: `c${n}`,
    custom: { name: `Snack ${n}`, estimatedBy: 'manual' },
    mealType: 'snack',
    portionMultiplier: 1,
    kcal: 100,
    protein: 5,
    carbs: 10,
    fat: 3,
  });

  it('pays at most 5 meals a day, across calls, and nothing again for a repeat', async () => {
    let entries = [1, 2, 3].map(custom);
    const w = makeWorld({
      dailyLogs: {
        findByDate: () => Promise.resolve(log(entries)),
        findLastN: () => Promise.resolve([]),
      },
    });
    const recorder = new ProgressRecorder(w.deps);

    await recorder.onDayChanged(USER, '2026-10-22');
    expect(w.ledger.ofKind('MEAL_LOGGED')).toHaveLength(3);

    entries = [1, 2, 3, 4, 5, 6, 7].map(custom);
    await recorder.onDayChanged(USER, '2026-10-22');
    await recorder.onDayChanged(USER, '2026-10-22');
    expect(w.ledger.ofKind('MEAL_LOGGED')).toHaveLength(5);
  });

  it('adds the on-plan bonus for a planned slot the user ate, and FULL_DAY when all slots are handled', async () => {
    const w = makeWorld({
      dailyLogs: {
        findLastN: () => Promise.resolve([]),
        findByDate: () =>
          Promise.resolve(
            log(
              [
                {
                  entryId: 'a',
                  recipeId: 'r1',
                  mealType: 'breakfast',
                  slotIndex: 0,
                  portionMultiplier: 1,
                  kcal: 400,
                  protein: 20,
                  carbs: 40,
                  fat: 10,
                },
                {
                  entryId: 'b',
                  recipeId: 'r2',
                  mealType: 'dinner',
                  slotIndex: 1,
                  portionMultiplier: 1,
                  kcal: 600,
                  protein: 30,
                  carbs: 60,
                  fat: 20,
                },
              ],
              // 2026-10-22 is a Thursday: dayOfWeek 3.
            ),
          ),
      },
      plans: {
        findForWeek: () =>
          Promise.resolve({
            id: 'p1',
            days: [
              {
                dayOfWeek: 3,
                meals: [
                  { type: 'breakfast', recipeId: 'r1' },
                  { type: 'dinner', recipeId: 'r2' },
                ],
              },
            ],
          } as never),
        findRecipesByIds: () =>
          Promise.resolve([
            { id: 'r1', name: 'Oats' },
            { id: 'r2', name: 'Stew' },
          ] as never),
      },
    });
    await new ProgressRecorder(w.deps).onDayChanged(USER, '2026-10-22');

    const meals = w.ledger.ofKind('MEAL_LOGGED');
    expect(meals.map((m) => m.xp)).toEqual([10, 10]);
    expect(meals.map((m) => m.key)).toEqual([
      'MEAL_LOGGED:2026-10-22:breakfast:0',
      'MEAL_LOGGED:2026-10-22:dinner:1',
    ]);
    expect(w.ledger.ofKind('FULL_DAY')).toHaveLength(1);
  });

  it('pays PROTEIN_GOAL when protein reaches the target, and not below it', async () => {
    const w = makeWorld({
      dailyLogs: {
        findLastN: () => Promise.resolve([]),
        findByDate: () => Promise.resolve(log([custom(1)], { totalProtein: 119 })),
      },
      proteinTarget: () => Promise.resolve(120),
    });
    const recorder = new ProgressRecorder(w.deps);
    await recorder.onDayChanged(USER, '2026-10-22');
    expect(w.ledger.ofKind('PROTEIN_GOAL')).toHaveLength(0);

    w.deps.dailyLogs = {
      findLastN: () => Promise.resolve([]),
      findByDate: () => Promise.resolve(log([custom(1)], { totalProtein: 121 })),
    };
    await new ProgressRecorder(w.deps).onDayChanged(USER, '2026-10-22');
    expect(w.ledger.ofKind('PROTEIN_GOAL')).toHaveLength(1);
  });

  it('pays no PROTEIN_GOAL in "hide numbers" mode (numbersMode NONE)', async () => {
    const w = makeWorld({
      dailyLogs: {
        findLastN: () => Promise.resolve([]),
        findByDate: () => Promise.resolve(log([custom(1)], { totalProtein: 200 })),
      },
      proteinTarget: () => Promise.resolve(120),
    });
    w.deps.profiles = {
      findByUserId: () => Promise.resolve({ numbersMode: 'NONE' } as never),
    };
    await new ProgressRecorder(w.deps).onDayChanged(USER, '2026-10-22');
    expect(w.ledger.ofKind('PROTEIN_GOAL')).toHaveLength(0);
    expect(w.ledger.ofKind('MEAL_LOGGED')).toHaveLength(1);
  });

  it('does nothing for a day without a log (a removal that emptied it)', async () => {
    const w = makeWorld();
    await new ProgressRecorder(w.deps).onDayChanged(USER, '2026-10-22');
    expect(w.ledger.appendCalls).toHaveLength(0);
  });
});
