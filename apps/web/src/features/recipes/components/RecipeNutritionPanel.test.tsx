// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RecipeNutritionPanel } from './RecipeNutritionPanel';

// Recipe detail (plan-ingredient-catalog §10): "Nutrition is computed from N
// ingredients" opens the per-line breakdown; PARTIAL says how many lines need
// data with a fix link for the owner; USER_ENTERED says "Entered by you".

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
afterEach(cleanup);

type Props = Parameters<typeof RecipeNutritionPanel>[0];
type Line = NonNullable<Props['recipe']['nutritionLines']>[number];

const line = (over: Partial<Line>): Line => ({
  position: 0,
  rawName: 'chicken',
  quantity: 200,
  unit: 'g',
  note: null,
  optional: false,
  ingredientId: 'chicken',
  ingredientName: 'Chicken breast, raw',
  nutritionSource: 'USDA_FDC',
  grams: 200,
  facts: { calories: 240, protein: 45, carbs: 0, fat: 5.2, fiber: 0 },
  ...over,
});

function recipe(over: Partial<Props['recipe']>): Props['recipe'] {
  return {
    servings: 2,
    nutritionInfo: { calories: 290, protein: 23, carbs: 10, fat: 12, fiber: 1 },
    nutritionStatus: 'COMPUTED',
    nutritionLines: [
      line({}),
      line({
        position: 1,
        rawName: 'olive oil',
        quantity: 1,
        unit: 'tbsp',
        ingredientId: 'oil',
        ingredientName: 'Olive oil',
        grams: 13.5,
        facts: { calories: 119, protein: 0, carbs: 0, fat: 13.5, fiber: 0 },
      }),
      line({ position: 2, rawName: 'parsley', optional: true, ingredientName: 'Parsley' }),
    ],
    ...over,
  } as Props['recipe'];
}

describe('RecipeNutritionPanel', () => {
  it('COMPUTED: says how many ingredients and expands into the per-line breakdown', () => {
    render(<RecipeNutritionPanel recipe={recipe({})} recipeId="r1" canEdit={false} />);
    const toggle = screen.getByRole('button', { name: /Nutrition is computed from 2 ingredients/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const list = screen.getByRole('list', { name: 'Nutrition per ingredient' });
    expect(within(list).getByText('Chicken breast, raw')).toBeTruthy();
    expect(within(list).getAllByText('240 kcal')).toHaveLength(2); // chicken + the optional line's fixture
    expect(within(list).getAllByText('45 g protein').length).toBeGreaterThan(0);
    expect(within(list).getByText(/1 tbsp · 13.5 g/)).toBeTruthy();
    expect(within(list).getByText(/optional, not counted/)).toBeTruthy();
    expect(within(list).getAllByText('USDA').length).toBeGreaterThan(0);
  });

  it('PARTIAL: "Incomplete — N ingredients need data" with a fix link for the owner only', () => {
    const partial = recipe({
      nutritionStatus: 'PARTIAL',
      nutritionLines: [
        line({}),
        line({
          position: 1,
          rawName: 'mystery spice',
          ingredientId: null,
          ingredientName: null,
          nutritionSource: null,
          grams: null,
          facts: null,
        }),
      ],
    });
    const { unmount } = render(
      <RecipeNutritionPanel recipe={partial} recipeId="r1" canEdit={true} />,
    );
    expect(screen.getByText(/Incomplete — 1 ingredient needs data/)).toBeTruthy();
    expect(screen.getByTestId('nutrition-fix-link').getAttribute('href')).toBe('/recipes/r1/edit');
    fireEvent.click(screen.getByRole('button', { name: /See the 2 ingredients/ }));
    expect(screen.getByText('Needs data')).toBeTruthy();
    unmount();

    render(<RecipeNutritionPanel recipe={partial} recipeId="r1" canEdit={false} />);
    expect(screen.queryByTestId('nutrition-fix-link')).toBeNull();
  });

  it('PARTIAL without stored lines (not migrated yet) never guesses a count', () => {
    render(
      <RecipeNutritionPanel
        recipe={recipe({ nutritionStatus: 'PARTIAL', nutritionLines: [] })}
        recipeId="r1"
        canEdit={true}
      />,
    );
    expect(screen.getByText(/aren’t linked to food data yet/)).toBeTruthy();
    expect(screen.queryByText(/ingredients? needs? data/)).toBeNull();
  });

  it('USER_ENTERED: "Entered by you"', () => {
    render(
      <RecipeNutritionPanel
        recipe={recipe({ nutritionStatus: 'USER_ENTERED', nutritionLines: [] })}
        recipeId="r1"
        canEdit={true}
      />,
    );
    expect(screen.getByText('Entered by you.')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Link the ingredients/ })).toBeTruthy();
  });

  it('a line on another user’s private ingredient shows its grams, never their numbers (I4)', () => {
    render(
      <RecipeNutritionPanel
        recipe={recipe({
          nutritionLines: [
            line({ ingredientId: null, ingredientName: null, nutritionSource: null, facts: null }),
          ],
        })}
        recipeId="r1"
        canEdit={false}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /computed from 1 ingredient/ }));
    expect(screen.getByText('Private ingredient')).toBeTruthy();
    expect(screen.queryByText('Needs data')).toBeNull();
  });
});
