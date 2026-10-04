// @vitest-environment jsdom
import { fakeSlotFlow } from '@/features/tracker/lib/slot-flow.fixture';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DayView } from './day-view';

// WP-06: the Plan day's slots carry "Ate something else" / "Skipped it", and
// show a replaced or skipped slot the way the tracker does (slotStates).

vi.mock('@/features/recipes/components/RecipeImage', () => ({ RecipeImage: () => null }));

afterEach(cleanup);

const recipe = (id: string, name: string, calories: number) => ({
  id,
  name,
  description: '',
  cuisineType: 'asian',
  prepTimeMins: 10,
  cookTimeMins: 20,
  nutritionInfo: { calories, protein: 30, carbs: 50, fat: 15, fiber: 5 },
});
const days = [
  {
    dayOfWeek: 2,
    meals: [
      { type: 'breakfast', recipe: recipe('oats', 'Oats', 350) },
      { type: 'lunch', recipe: recipe('salad', 'Greek Salad', 450) },
      { type: 'dinner', recipe: recipe('curry', 'Chicken Curry', 700) },
    ],
  },
];

const renderDay = (
  over: { loggedMeals?: object[]; skippedSlots?: { mealType: string; slotIndex: number }[] } = {},
  flow = fakeSlotFlow(),
) => {
  render(
    <DayView
      days={days}
      planId="p1"
      selectedDay={2}
      onSelectDay={vi.fn()}
      todayIndex={2}
      slotUi={{
        flow,
        loggedMeals: (over.loggedMeals ?? []) as never[],
        skippedSlots: over.skippedSlots ?? [],
      }}
    />,
  );
  return flow;
};

describe('DayView — flexible eating on the Plan day (WP-06)', () => {
  it('every slot has an overflow that acts on its own slot', () => {
    const flow = renderDay();
    expect(screen.getAllByRole('button', { name: /^More actions for/ })).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Lunch' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ate something else' }));
    expect(flow.openAteElse).toHaveBeenCalledWith(
      expect.objectContaining({ mealType: 'lunch', slotIndex: 1 }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Dinner' }));
    fireEvent.click(screen.getByRole('button', { name: 'Skipped it' }));
    expect(flow.skip).toHaveBeenCalledWith(
      expect.objectContaining({ mealType: 'dinner', slotIndex: 2 }),
    );
  });

  it('a replaced slot reads "You had: …" with an Undo, and loses its overflow', () => {
    const flow = renderDay({
      loggedMeals: [
        {
          entryId: 'r1',
          custom: { name: 'Shawarma · normal', estimatedBy: 'manual' },
          mealType: 'dinner',
          portionMultiplier: 1,
          kcal: 775,
          protein: 40,
          carbs: 0,
          fat: 0,
          replacesSlot: { mealType: 'dinner', slotIndex: 2 },
        },
      ],
    });
    expect(screen.getByTestId('plan-slot-note-dinner-2').textContent).toBe(
      'You had: Shawarma · normal (≈ 775 kcal)',
    );
    expect(screen.queryByRole('button', { name: 'More actions for Dinner' })).toBeNull();
    fireEvent.click(screen.getByTestId('plan-slot-undo-dinner-2'));
    expect(flow.undoReplacement).toHaveBeenCalledWith(
      'r1',
      expect.objectContaining({ mealType: 'dinner', slotIndex: 2 }),
    );
  });

  it('a skipped slot reads "Skipped" with an Undo', () => {
    const flow = renderDay({ skippedSlots: [{ mealType: 'lunch', slotIndex: 1 }] });
    expect(screen.getByTestId('plan-slot-note-lunch-1').textContent).toBe('Skipped');
    fireEvent.click(screen.getByTestId('plan-slot-undo-lunch-1'));
    expect(flow.unskip).toHaveBeenCalledWith(
      expect.objectContaining({ mealType: 'lunch', slotIndex: 1 }),
    );
  });

  it('an eaten slot can be replaced but not skipped', () => {
    renderDay({
      loggedMeals: [
        {
          recipeId: 'salad',
          mealType: 'lunch',
          slotIndex: 1,
          portionMultiplier: 1,
          kcal: 450,
          protein: 30,
          carbs: 50,
          fat: 15,
        },
      ],
    });
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Lunch' }));
    expect(screen.getByRole('button', { name: 'Ate something else' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Skipped it' })).toBeNull();
    expect(screen.getByTestId('plan-meal-lunch-eaten')).toBeTruthy();
  });

  it('without slotUi (future days, history) there is no overflow', () => {
    render(
      <DayView days={days} planId="p1" selectedDay={2} onSelectDay={vi.fn()} todayIndex={2} />,
    );
    expect(screen.queryByRole('button', { name: /More actions/ })).toBeNull();
  });
});
