import { render, screen } from '@testing-library/react-native';
import { PlanMealCard } from '../../src/features/meal-plan/plan-meal-card';
import {
  AllergenWarningBanner,
  AllergenWarningChip,
} from '../../src/features/recipes/allergen-warning';

// UX-PLAN-06: a diet conflict reads as what the dish is NOT ("Not paleo:
// contains quinoa"), never "Contains Paleo"; allergens keep "Contains …".
// UX-REC-01: a tag-only pass never earns the "Checked for" chip.

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const recipe = (over: Record<string, unknown> = {}) => ({
  id: 'r1',
  name: 'Mexican Quinoa Salad',
  description: '',
  ingredients: [],
  instructions: [],
  nutritionInfo: { calories: 500, protein: 20, carbs: 60, fat: 15, fiber: 8 },
  cuisineType: 'mexican',
  dietaryTags: ['paleo'],
  prepTimeMins: 10,
  cookTimeMins: 10,
  servings: 1,
  imageUrl: null,
  imageStatus: 'DONE' as const,
  ...over,
});

describe('diet conflict copy', () => {
  it('the banner names the diet and the ingredient from the API details', async () => {
    await render(
      <AllergenWarningBanner
        warnings={['non-paleo']}
        details={[{ label: 'Paleo', kind: 'diet', ingredients: ['quinoa'] }]}
      />,
    );
    const banner = screen.getByTestId('allergen-warning');
    expect(banner).toHaveTextContent(/Not paleo: contains quinoa\./);
    expect(banner).not.toHaveTextContent(/Contains Paleo/);
  });

  it('older API responses still read "Not paleo", not "Contains non-paleo"', async () => {
    await render(<AllergenWarningBanner warnings={['non-paleo', 'non-vegetarian']} />);
    expect(screen.getByTestId('allergen-warning')).toHaveTextContent(/Not paleo or vegetarian\./);
  });

  it('allergens keep "Contains …"', async () => {
    await render(<AllergenWarningChip warnings={['peanut']} />);
    expect(screen.getByLabelText('Contains peanut')).toBeTruthy();
  });

  it('a plan card with a diet conflict says "Not paleo: contains quinoa"', async () => {
    await render(
      <PlanMealCard
        testID="card"
        meal={{
          type: 'lunch',
          recipe: recipe({
            safetyChecks: {
              checked: [],
              conflicts: ['Paleo'],
              unchecked: [],
              conflictDetails: [{ label: 'Paleo', kind: 'diet', ingredients: ['quinoa'] }],
            },
          }),
        }}
      />,
    );
    expect(screen.getByTestId('card-conflict')).toHaveTextContent(/Not paleo: contains quinoa/);
    expect(screen.queryByText(/Contains Paleo/)).toBeNull();
    expect(screen.queryByTestId('card-checked')).toBeNull();
  });

  it('a tag-only pass shows no "Checked for" chip on the plan card', async () => {
    await render(
      <PlanMealCard
        testID="card"
        meal={{
          type: 'lunch',
          recipe: recipe({
            safetyChecks: {
              checked: [
                { label: 'Vegetarian', who: 'you' },
                { label: 'Paleo', who: 'you' },
              ],
              taggedOnly: [{ label: 'Paleo', who: 'you' }],
              conflicts: [],
              unchecked: [],
            },
          }),
        }}
      />,
    );
    // Only the verified rule counts: "Checked for 1", not 2.
    expect(screen.getByText('Checked for 1')).toBeOnTheScreen();
    expect(screen.queryByText('Checked for 2')).toBeNull();
  });
});
