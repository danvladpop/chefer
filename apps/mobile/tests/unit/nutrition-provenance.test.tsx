import { fireEvent, render, screen } from '@testing-library/react-native';
import {
  NutritionProvenance,
  NutritionStatusTag,
  provenanceText,
  type NutritionLineRow,
} from '../../src/features/ingredients/nutrition-provenance';

// plan-ingredient-catalog §10 (P9): the recipe-detail proof that nutrition is
// computed, and the caveat tag on cards.

const lines: NutritionLineRow[] = [
  {
    position: 0,
    rawName: 'chicken',
    quantity: 200,
    unit: 'g',
    note: null,
    optional: false,
    ingredientId: 'chicken-id',
    ingredientName: 'Chicken breast, raw',
    nutritionSource: 'USDA_FDC',
    grams: 200,
    facts: { calories: 240, protein: 45.2, carbs: 0, fat: 5.2, fiber: 0 },
  },
  {
    position: 1,
    rawName: 'grandma spice',
    quantity: 1,
    unit: 'tsp',
    note: null,
    optional: false,
    ingredientId: null,
    ingredientName: null,
    nutritionSource: null,
    grams: null,
    facts: null,
  },
  {
    position: 2,
    rawName: 'secret sauce',
    quantity: 10,
    unit: 'g',
    note: null,
    optional: false,
    ingredientId: 'someone-elses-private',
    ingredientName: null,
    nutritionSource: null,
    grams: 10,
    facts: null,
  },
];

describe('provenanceText', () => {
  it('names each status, or nothing for an API without one', () => {
    expect(provenanceText('COMPUTED', lines, 3)).toBe('Computed from 3 ingredients');
    expect(provenanceText('PARTIAL', lines, 3)).toBe('Incomplete — 1 ingredient needs data');
    expect(provenanceText('USER_ENTERED', lines, 3)).toBe('Entered by you');
    expect(provenanceText(null, lines, 3)).toBeNull();
    expect(provenanceText('COMPUTED', [], 4)).toBe('Computed from 4 ingredients');
  });
});

describe('NutritionProvenance', () => {
  it('PARTIAL offers the owner a fix and expands into the per-line breakdown', async () => {
    const onFix = jest.fn();
    await render(
      <NutritionProvenance
        status="PARTIAL"
        lines={lines}
        ingredientCount={3}
        servings={2}
        onFix={onFix}
      />,
    );
    await fireEvent.press(screen.getByTestId('recipe-nutrition-provenance-fix'));
    expect(onFix).toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('recipe-nutrition-provenance-toggle'));
    expect(screen.getByTestId('recipe-nutrition-provenance-line-0')).toHaveTextContent(
      /Chicken breast, raw.*200 g.*USDA.*240 kcal · 45.2 g protein/,
    );
    expect(screen.getByTestId('recipe-nutrition-provenance-line-1')).toHaveTextContent(
      /needs data/,
    );
    // I4: someone else's private row shows grams, never its name or numbers.
    expect(screen.getByTestId('recipe-nutrition-provenance-line-2')).toHaveTextContent(
      /Private ingredient.*10 g/,
    );
    expect(screen.queryByText('secret sauce')).toBeNull();
  });

  it('USER_ENTERED says so and offers no breakdown; no fix link without an owner', async () => {
    await render(
      <NutritionProvenance status="USER_ENTERED" lines={lines} ingredientCount={3} servings={1} />,
    );
    expect(screen.getByText('Entered by you')).toBeOnTheScreen();
    expect(screen.queryByTestId('recipe-nutrition-provenance-toggle')).toBeNull();
    expect(screen.queryByTestId('recipe-nutrition-provenance-fix')).toBeNull();
  });
});

describe('NutritionStatusTag', () => {
  it('tags PARTIAL and USER_ENTERED only', async () => {
    await render(<NutritionStatusTag status="PARTIAL" testID="tag" />);
    expect(screen.getByTestId('tag')).toHaveTextContent('· Incomplete');
    await render(<NutritionStatusTag status="COMPUTED" testID="tag2" />);
    expect(screen.queryByTestId('tag2')).toBeNull();
  });
});
