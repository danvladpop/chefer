// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DayRecapBar } from './DayRecapBar';
import { MealCard } from './MealCard';

vi.mock('@/features/recipes/components/RecipeImage', () => ({
  RecipeImage: () => null,
}));

afterEach(cleanup);

const nutrition = (calories: number, protein: number) => ({
  calories,
  protein,
  carbs: 50,
  fat: 20,
  fiber: 5,
});

describe('DayRecapBar — plan portions (audit P1-1)', () => {
  it('totals each slot at its portion', () => {
    render(
      <DayRecapBar
        meals={[
          { type: 'breakfast', recipe: { nutritionInfo: nutrition(400, 20) } },
          { type: 'dinner', recipe: { nutritionInfo: nutrition(600, 40) }, portion: 1.5 },
        ]}
        calorieTarget={1300}
      />,
    );
    // 400 + 600 × 1.5 = 1,300 kcal; 20 + 60 = 80 g protein.
    expect(screen.getByText('1300 kcal')).toBeTruthy();
    expect(screen.getByText('P 80g')).toBeTruthy();
    expect(screen.queryByText(/under target/)).toBeNull();
  });

  it('shows an honest protein hint only when the API flags a gap', () => {
    const meals = [{ type: 'dinner', recipe: { nutritionInfo: nutrition(2000, 90) } }];
    const { rerender } = render(<DayRecapBar meals={meals} proteinGapG={85} />);
    expect(screen.getByTestId('day-protein-gap').textContent).toBe(
      'Protein short by 85 g — add a snack',
    );
    rerender(<DayRecapBar meals={meals} />);
    expect(screen.queryByTestId('day-protein-gap')).toBeNull();
  });
});

describe('MealCard — plan portions (audit P1-1)', () => {
  const recipe = {
    id: 'r1',
    name: 'Chicken Rice Bowl',
    description: '',
    cuisineType: 'asian',
    prepTimeMins: 10,
    cookTimeMins: 20,
    nutritionInfo: nutrition(500, 40),
  };

  it('shows the portion, its kcal, and opens the recipe pre-set to it', () => {
    render(
      <MealCard
        variant="row"
        mealType="dinner"
        recipe={recipe}
        planId="p1"
        dayOfWeek={2}
        portion={1.5}
      />,
    );
    expect(screen.getByText('750 kcal')).toBeTruthy();
    expect(screen.getByText('1½× portion')).toBeTruthy();
    expect(screen.getByRole('link').getAttribute('href')).toBe(
      '/recipes/r1?planId=p1&day=2&meal=dinner&portion=1.5',
    );
  });

  it('looks exactly as before at 1×', () => {
    render(<MealCard variant="row" mealType="dinner" recipe={recipe} planId="p1" dayOfWeek={2} />);
    expect(screen.getByText('500 kcal')).toBeTruthy();
    expect(screen.queryByText(/portion/)).toBeNull();
    expect(screen.getByRole('link').getAttribute('href')).toBe(
      '/recipes/r1?planId=p1&day=2&meal=dinner',
    );
  });
});
