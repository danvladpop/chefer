import { fireEvent, render, screen } from '@testing-library/react-native';
import { HeroMealCard } from '../../src/features/dashboard/components/hero-meal-card';
import { PlanDayTotals } from '../../src/features/meal-plan/plan-day-totals';
import { PlanMealCard } from '../../src/features/meal-plan/plan-meal-card';

// Curated plan portions (audit P1-1): slots sized 0.75×–2× to the day's
// targets show and open at their portion, and a protein-short day says so.

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
// The Today hero logs through tracker.logRecipe (P2-2) — no network here.
jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({}),
    tracker: {
      logRecipe: {
        useMutation: () => ({ mutate: jest.fn(), isPending: false, isError: false }),
      },
    },
  },
}));
jest.mock('../../src/features/tracker/rebalance-store', () => ({ recordRebalance: jest.fn() }));
const { router } = jest.requireMock<{ router: { push: jest.Mock } }>('expo-router');

const nutrition = (calories: number, protein: number) => ({
  calories,
  protein,
  carbs: 50,
  fat: 20,
  fiber: 5,
});

const recipe = {
  id: 'r1',
  name: 'Chicken Rice Bowl',
  description: '',
  ingredients: [],
  instructions: [],
  nutritionInfo: nutrition(500, 40),
  cuisineType: 'asian',
  dietaryTags: [],
  prepTimeMins: 10,
  cookTimeMins: 20,
  servings: 1,
  imageUrl: null,
  imageStatus: 'DONE' as const,
};

beforeEach(() => router.push.mockClear());

describe('PlanDayTotals', () => {
  it('totals each slot at its portion', async () => {
    await render(
      <PlanDayTotals
        meals={[
          { recipe: { nutritionInfo: nutrition(400, 20) } },
          { recipe: { nutritionInfo: nutrition(600, 40) }, portion: 1.5 },
        ]}
        calorieTarget={1300}
      />,
    );
    expect(screen.getByTestId('plan-day-totals-kcal')).toHaveTextContent('1,300 kcal');
    expect(screen.getByText('P 80g · C 125g · F 50g')).toBeOnTheScreen();
    expect(screen.queryByText(/under target/)).toBeNull();
  });

  it('shows the protein hint only when the API flags a gap', async () => {
    const meals = [{ recipe: { nutritionInfo: nutrition(2000, 90) } }];
    await render(<PlanDayTotals meals={meals} proteinGapG={85} />);
    expect(screen.getByTestId('plan-day-totals-protein-gap')).toHaveTextContent(
      'Protein short by 85 g — add a snack',
    );
    await render(<PlanDayTotals meals={meals} />);
    expect(screen.queryByTestId('plan-day-totals-protein-gap')).toBeNull();
  });
});

describe('PlanMealCard', () => {
  it('shows the portion and its kcal, and opens the recipe at it', async () => {
    await render(
      <PlanMealCard
        testID="plan-meal-dinner"
        day={2}
        meal={{ type: 'dinner', recipe, portion: 1.5 }}
      />,
    );
    expect(screen.getByTestId('plan-meal-dinner-portion')).toHaveTextContent('1½× portion');
    expect(screen.getByText('750 kcal')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('plan-meal-dinner'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/recipe/[id]',
      params: { id: 'r1', day: '2', meal: 'dinner', portion: '1.5' },
    });
  });

  it('is unchanged at 1×', async () => {
    await render(
      <PlanMealCard testID="plan-meal-dinner" day={2} meal={{ type: 'dinner', recipe }} />,
    );
    expect(screen.queryByTestId('plan-meal-dinner-portion')).toBeNull();
    expect(screen.getByText('500 kcal')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('plan-meal-dinner'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/recipe/[id]',
      params: { id: 'r1', day: '2', meal: 'dinner' },
    });
  });
});

describe('HeroMealCard', () => {
  const hero = {
    mealType: 'dinner',
    recipe: {
      id: 'r1',
      name: 'Chicken Rice Bowl',
      description: '',
      imageUrl: null,
      kcal: 750,
      servings: 1,
      prepTimeMins: 10,
    },
  };

  it('carries the plan portion into the recipe link', async () => {
    await render(<HeroMealCard meal={{ ...hero, portion: 1.5 }} isTomorrow={false} />);
    expect(screen.getByText(/750 kcal · 1½× portion/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('hero-meal-card-open'));
    expect(router.push).toHaveBeenCalledWith('/recipe/r1?portion=1.5');
  });

  it('opens the plain recipe without a portion', async () => {
    await render(<HeroMealCard meal={hero} isTomorrow={false} />);
    await fireEvent.press(screen.getByTestId('hero-meal-card-open'));
    expect(router.push).toHaveBeenCalledWith('/recipe/r1');
  });
});
