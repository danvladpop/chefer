// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DAY_FIT_COPY } from '@chefer/utils';
import { DayFitSuggestionCard } from './DayFitSuggestionCard';
import { DayRecapBar } from './DayRecapBar';
import { MealCard } from './MealCard';
import { PortionRefitNotice } from './PortionRefitNotice';

// Day rebalance (2026-10-16) on the Meals page: the "adjusted" marker on a
// resized card, the one-change suggestion card, and the targets refit notice.

vi.mock('@/features/recipes/components/RecipeImage', () => ({ RecipeImage: () => null }));

afterEach(cleanup);

const recipe = {
  id: 'salad',
  name: 'Couscous Salad',
  description: '',
  cuisineType: 'any',
  prepTimeMins: 10,
  cookTimeMins: 10,
  nutritionInfo: { calories: 590, protein: 20, carbs: 70, fat: 20, fiber: 6 },
};

describe('MealCard — adjusted marker', () => {
  it.each(['row', 'grid'] as const)(
    '%s: a resized slot gets the brand border and a highlighted portion badge',
    (variant) => {
      const { container } = render(
        <MealCard
          variant={variant}
          mealType="lunch"
          recipe={recipe}
          planId="p1"
          dayOfWeek={1}
          slotIndex={1}
          portion={1.5}
          adjusted
        />,
      );
      const badge = screen.getByTestId('plan-meal-lunch-adjusted');
      expect(badge.textContent).toContain('1½×');
      expect(badge.textContent).toContain('adjusted');
      expect(container.querySelector('a')?.className).toContain('border-[#944a00]');
    },
  );

  it('an untouched slot has neither', () => {
    const { container } = render(
      <MealCard
        variant="row"
        mealType="lunch"
        recipe={recipe}
        planId="p1"
        dayOfWeek={1}
        portion={1.5}
      />,
    );
    expect(screen.queryByTestId('plan-meal-lunch-adjusted')).toBeNull();
    expect(container.querySelector('a')?.className).toContain('border-gray-200');
    expect(screen.getByText('1½× portion')).toBeTruthy();
  });
});

describe('DayFitSuggestionCard (board DayFitSuggest)', () => {
  const swap = {
    kind: 'swap' as const,
    slotIndex: 0,
    mealType: 'breakfast',
    recipeId: 'bowl',
    recipeName: 'Greek Yogurt Protein Bowl',
    kcalDelta: 390,
    proteinDelta: 31,
  };

  it('shows the shared copy inside the day totals; the action applies, Leave it hides', () => {
    const onApply = vi.fn();
    const onLeave = vi.fn();
    render(
      <DayRecapBar
        meals={[{ type: 'lunch', recipe: { nutritionInfo: recipe.nutritionInfo } }]}
        calorieTarget={2700}
      >
        <DayFitSuggestionCard
          dayOfWeek={2}
          kcal={1980}
          suggestion={swap}
          onApply={onApply}
          onLeave={onLeave}
        />
      </DayRecapBar>,
    );
    const card = screen.getByRole('group', { name: 'Suggestion' });
    expect(card.textContent).toContain(
      'Resizing portions only gets Wednesday to 1,980 kcal. One change closes it:',
    );
    expect(screen.getByTestId('day-fit-suggestion-title').textContent).toBe(
      'Breakfast → Greek Yogurt Protein Bowl',
    );
    expect(card.textContent).toContain('+390 kcal · +31 g protein');

    fireEvent.click(screen.getByRole('button', { name: 'Swap breakfast' }));
    expect(onApply).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: DAY_FIT_COPY.leaveIt }));
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it('a snack suggestion says "Add a snack"; buttons are 44px tall', () => {
    render(
      <DayFitSuggestionCard
        dayOfWeek={4}
        kcal={1700}
        suggestion={{ ...swap, kind: 'snack', mealType: 'snack', recipeName: 'Trail Mix' }}
        onApply={vi.fn()}
        onLeave={vi.fn()}
      />,
    );
    expect(screen.getByTestId('day-fit-suggestion-title').textContent).toBe('Add Trail Mix');
    const action = screen.getByRole('button', { name: 'Add a snack' });
    expect(action.className).toContain('min-h-11');
    expect(screen.getByRole('button', { name: DAY_FIT_COPY.leaveIt }).className).toContain(
      'min-h-11',
    );
  });
});

describe('PortionRefitNotice (board PlanRefit)', () => {
  it('says what changed, with Undo and a labelled dismiss', () => {
    const onUndo = vi.fn();
    const onDismiss = vi.fn();
    render(<PortionRefitNotice days={5} onUndo={onUndo} onDismiss={onDismiss} />);
    const notice = screen.getByRole('status');
    expect(notice.textContent).toContain(DAY_FIT_COPY.refitTitle);
    expect(notice.textContent).toContain('Same meals, resized on 5 days to match.');
    fireEvent.click(screen.getByRole('button', { name: DAY_FIT_COPY.undo }));
    expect(onUndo).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: DAY_FIT_COPY.refitDismiss }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
