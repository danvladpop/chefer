import { describe, expect, it } from 'vitest';
import { pickTodaysThree, questDone } from './todays-three';

type Input = Parameters<typeof pickTodaysThree>[0];

const base: Input = {
  localDate: '2026-10-22',
  plannedSlots: [],
  proteinTargetG: null,
  showProtein: false,
  workoutPlannedToday: false,
  shoppingUnchecked: 0,
  quiet: false,
};

const slots = (
  ...s: [
    mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack',
    recipe: string | null,
    logged?: boolean,
  ][]
) =>
  s.map(([mealType, recipe, logged], slotIndex) => ({
    mealType,
    slotIndex,
    ...(recipe ? { recipeId: recipe, recipeName: recipe.toUpperCase() } : {}),
    logged: logged ?? false,
  }));

const ids = (input: Input) => pickTodaysThree(input).map((q) => q.id);

describe('pickTodaysThree', () => {
  it('with nothing planned, the fallback is log any meal', () => {
    expect(pickTodaysThree(base)).toEqual([{ id: 'LOG_ANY', kind: 'LOG_ANY', xp: 5, done: false }]);
  });

  it('a full day of options picks workout, cook, log in priority order', () => {
    const out = pickTodaysThree({
      ...base,
      plannedSlots: slots(['breakfast', null], ['lunch', 'r1'], ['dinner', 'r2']),
      proteinTargetG: 120,
      showProtein: true,
      workoutPlannedToday: true,
      shoppingUnchecked: 4,
    });
    expect(out.map((q) => q.id)).toEqual(['WORKOUT', 'COOK:dinner', 'LOG_SLOT:breakfast']);
    expect(out.map((q) => q.xp)).toEqual([40, 25, 10]);
    expect(out.every((q) => !q.done)).toBe(true);
    expect(out[1]).toMatchObject({
      kind: 'COOK',
      mealType: 'dinner',
      recipeId: 'r2',
      recipeName: 'R2',
    });
  });

  it('cooks lunch when dinner has no recipe', () => {
    expect(ids({ ...base, plannedSlots: slots(['lunch', 'r1'], ['dinner', null]) })).toEqual([
      'COOK:lunch',
      'LOG_SLOT:dinner',
      'LOG_ANY',
    ]);
  });

  it('skips a cook slot that is already logged', () => {
    expect(ids({ ...base, plannedSlots: slots(['lunch', 'r1'], ['dinner', 'r2', true]) })).toEqual([
      'COOK:lunch',
      'LOG_ANY',
    ]);
  });

  it('log-slot goes breakfast → lunch → dinner → snack and skips logged slots', () => {
    expect(
      ids({
        ...base,
        plannedSlots: slots(
          ['snack', null],
          ['dinner', null],
          ['breakfast', null, true],
          ['lunch', null],
        ),
      }),
    ).toEqual(['LOG_SLOT:lunch', 'LOG_ANY']);
    expect(ids({ ...base, plannedSlots: slots(['snack', null], ['dinner', null]) })).toEqual([
      'LOG_SLOT:dinner',
      'LOG_ANY',
    ]);
  });

  it('protein needs the target, the numbers mode and a not-quiet day', () => {
    const withProtein = { ...base, proteinTargetG: 130, showProtein: true };
    expect(pickTodaysThree(withProtein)[0]).toMatchObject({
      id: 'PROTEIN',
      kind: 'PROTEIN',
      xp: 10,
      proteinTargetG: 130,
    });
    expect(ids({ ...withProtein, showProtein: false })).not.toContain('PROTEIN');
    expect(ids({ ...withProtein, proteinTargetG: null })).not.toContain('PROTEIN');
  });

  it('quiet never offers protein', () => {
    expect(
      ids({ ...base, proteinTargetG: 130, showProtein: true, quiet: true, shoppingUnchecked: 2 }),
    ).toEqual(['SHOP', 'LOG_ANY']);
  });

  it('shopping needs unchecked items', () => {
    expect(ids({ ...base, shoppingUnchecked: 3 })).toEqual(['SHOP', 'LOG_ANY']);
    expect(pickTodaysThree({ ...base, shoppingUnchecked: 3 })[0]?.xp).toBe(10);
  });

  it('never exceeds three and never repeats an id', () => {
    const out = ids({
      ...base,
      plannedSlots: slots(['breakfast', null], ['lunch', null], ['dinner', null], ['snack', null]),
      workoutPlannedToday: true,
      shoppingUnchecked: 9,
      proteinTargetG: 100,
      showProtein: true,
    });
    expect(out).toHaveLength(3);
    expect(new Set(out).size).toBe(3);
  });

  it('is deterministic', () => {
    const input = { ...base, plannedSlots: slots(['breakfast', null], ['dinner', 'r']) };
    expect(pickTodaysThree(input)).toEqual(pickTodaysThree(input));
  });
});

describe('questDone', () => {
  const quest = (id: string, kind: string, mealType?: string) =>
    ({ id, kind, xp: 0, done: false, ...(mealType ? { mealType } : {}) }) as never;

  it('LOG_SLOT: a meal of that type', () => {
    const q = quest('LOG_SLOT:breakfast', 'LOG_SLOT', 'breakfast');
    expect(questDone(q, [{ kind: 'MEAL_LOGGED', meta: { mealType: 'lunch' } }])).toBe(false);
    expect(questDone(q, [{ kind: 'MEAL_LOGGED', meta: { mealType: 'breakfast' } }])).toBe(true);
    expect(questDone(q, [{ kind: 'MEAL_LOGGED', meta: {} }])).toBe(false);
  });

  it('COOK, PROTEIN, WORKOUT, SHOP and LOG_ANY read their own event', () => {
    expect(
      questDone(quest('COOK:dinner', 'COOK', 'dinner'), [{ kind: 'COOK_FINISHED', meta: {} }]),
    ).toBe(true);
    expect(questDone(quest('PROTEIN', 'PROTEIN'), [{ kind: 'PROTEIN_GOAL', meta: {} }])).toBe(true);
    expect(questDone(quest('WORKOUT', 'WORKOUT'), [{ kind: 'WORKOUT_COMPLETED', meta: {} }])).toBe(
      true,
    );
    expect(questDone(quest('SHOP', 'SHOP'), [{ kind: 'SHOP_DONE', meta: {} }])).toBe(true);
    expect(questDone(quest('LOG_ANY', 'LOG_ANY'), [{ kind: 'MEAL_LOGGED', meta: {} }])).toBe(true);
  });

  it('other events do not count', () => {
    expect(questDone(quest('SHOP', 'SHOP'), [{ kind: 'MEAL_LOGGED', meta: {} }])).toBe(false);
    expect(questDone(quest('LOG_ANY', 'LOG_ANY'), [])).toBe(false);
    expect(questDone(quest('COOK:dinner', 'COOK'), [{ kind: 'WORKOUT_COMPLETED', meta: {} }])).toBe(
      false,
    );
  });
});
