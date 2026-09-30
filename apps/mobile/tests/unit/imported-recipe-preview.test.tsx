import { render, screen } from '@testing-library/react-native';
import { ImportedRecipePreview } from '../../src/features/recipes/imported-recipe-preview';

// Owner dogfood 2026-09-30: an imported recipe is checkable before Save —
// every ingredient and every step, not just the summary line.

const recipe = {
  name: 'Chilli Con Carne',
  description: 'A weeknight chilli.',
  servings: 2,
  prepTimeMins: 15,
  cookTimeMins: 30,
  ingredients: Array.from({ length: 12 }, (_, i) => ({
    name: `Ingredient ${i + 1}`,
    quantity: 0.5 + i,
    unit: 'g',
  })),
  instructions: ['Brown the mince.', 'Add the beans.', 'Simmer for 30 minutes.'],
  nutritionInfo: { calories: 346, protein: 28, carbs: 30, fat: 12 },
};

describe('ImportedRecipePreview', () => {
  it('shows the whole recipe: all ingredients, all steps and the macros', async () => {
    await render(<ImportedRecipePreview recipe={recipe} label="Cheferized for you" />);
    expect(screen.getByText(/Preview · Cheferized for you/)).toBeOnTheScreen();
    expect(screen.getByTestId('import-full-preview-name')).toHaveTextContent('Chilli Con Carne');
    expect(screen.getByText('Ingredients (12)')).toBeOnTheScreen();
    expect(screen.getByTestId('import-full-preview-ingredient-11')).toHaveTextContent(
      /Ingredient 12/,
    );
    expect(screen.getByText('Steps (3)')).toBeOnTheScreen();
    expect(screen.getByText('Simmer for 30 minutes.')).toBeOnTheScreen();
    expect(screen.getByText('346')).toBeOnTheScreen();
    expect(screen.getByText('Prep 15m · Cook 30m · 2 servings')).toBeOnTheScreen();
  });
});
