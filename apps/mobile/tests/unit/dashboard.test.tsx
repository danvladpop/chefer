import { render, screen, userEvent } from '@testing-library/react-native';
import { NutritionSummary } from '../../src/features/dashboard/components/nutrition-summary';
import { WeekOutlook } from '../../src/features/dashboard/components/week-outlook';

const nutrition = (plannedKcal: number) => ({
  dailyCalorieTarget: 2000,
  plannedKcal,
  protein: { planned: 100, targetG: 140 },
  carbs: { planned: 180, targetG: 220 },
  fat: { planned: 50, targetG: 70 },
});

describe('NutritionSummary', () => {
  // Three-state honesty from web review P-2 — the exact thresholds matter.
  it.each([
    [0, 'No Meals Planned'],
    [1500, 'Under Target'], // ratio 0.75 < 0.85
    [1900, 'On Track'], // 0.95
    [2200, 'Over Target'], // 1.1 > 1.05
  ])('%i kcal → "%s"', async (planned, label) => {
    await render(<NutritionSummary nutrition={nutrition(planned)} />);
    expect(screen.getByTestId('nutrition-status')).toHaveTextContent(label);
  });

  it('shows calories, remaining, and macro values', async () => {
    await render(<NutritionSummary nutrition={nutrition(1900)} />);
    expect(screen.getByText(/of 2,000 kcal · 100 remaining/)).toBeOnTheScreen();
    expect(screen.getByText('100g / 140g')).toBeOnTheScreen();
  });
});

describe('WeekOutlook', () => {
  const weekPlan = [
    {
      dayOfWeek: 0,
      meals: [
        {
          mealType: 'breakfast',
          recipeId: 'r1',
          recipeName: 'Overnight Oats',
          imageUrl: null,
          kcal: 420,
        },
      ],
    },
  ];

  it('renders 7 day chips and toggles the day panel on tap', async () => {
    const user = userEvent.setup();
    await render(<WeekOutlook weekPlan={weekPlan} />);

    for (let i = 0; i < 7; i++) {
      expect(screen.getByTestId(`day-chip-${i}`)).toBeOnTheScreen();
    }

    await user.press(screen.getByTestId('day-chip-0'));
    expect(screen.getByText('Overnight Oats')).toBeOnTheScreen();

    // Tapping again collapses the panel
    await user.press(screen.getByTestId('day-chip-0'));
    expect(screen.queryByText('Overnight Oats')).not.toBeOnTheScreen();
  });

  it('shows the empty state for a day without meals', async () => {
    const user = userEvent.setup();
    await render(<WeekOutlook weekPlan={weekPlan} />);
    await user.press(screen.getByTestId('day-chip-3'));
    expect(screen.getByText('No meals planned for this day.')).toBeOnTheScreen();
  });
});
