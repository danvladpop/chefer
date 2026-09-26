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

  it('shows the calorie ring, remaining, and macro values', async () => {
    await render(<NutritionSummary nutrition={nutrition(1900)} />);
    const ring = screen.getByTestId('calorie-ring');
    expect(ring).toHaveAccessibleName('1,900 of 2,000 kcal planned');
    expect(ring).toHaveAccessibilityValue({ min: 0, max: 100, now: 95 });
    expect(screen.getByText('of 2,000 kcal')).toBeOnTheScreen();
    expect(screen.getByTestId('calorie-remaining')).toHaveTextContent('100 remaining');
    expect(screen.getByText('100g / 140g')).toBeOnTheScreen();
    // The count-up lands on the planned total (screen readers get it at once).
    expect(screen.getByTestId('calorie-count')).toHaveAccessibleName('1,900');
    expect(await screen.findByText('1,900')).toBeOnTheScreen();
  });

  it('shows the planned total immediately under reduced motion', async () => {
    (globalThis as typeof globalThis & { __REDUCED_MOTION__?: boolean }).__REDUCED_MOTION__ = true;
    try {
      await render(<NutritionSummary nutrition={nutrition(1900)} />);
      expect(screen.getByTestId('calorie-count')).toHaveTextContent('1,900');
    } finally {
      (globalThis as typeof globalThis & { __REDUCED_MOTION__?: boolean }).__REDUCED_MOTION__ =
        false;
    }
  });

  it('marks calories and macros over target (MO-06: 2,810 of 2,728; fat 81 g of 62 g)', async () => {
    await render(
      <NutritionSummary
        nutrition={{
          dailyCalorieTarget: 2728,
          plannedKcal: 2810,
          protein: { planned: 120, targetG: 140 },
          carbs: { planned: 250, targetG: 300 },
          fat: { planned: 81, targetG: 62 },
        }}
      />,
    );
    expect(screen.getByTestId('calorie-ring-overflow')).toBeOnTheScreen();
    expect(screen.getByTestId('calorie-remaining')).toHaveTextContent('0 remaining');
    expect(screen.getByTestId('macro-fat-cap')).toBeOnTheScreen();
    expect(screen.queryByTestId('macro-protein-cap')).toBeNull();
    expect(screen.queryByTestId('macro-carbs-cap')).toBeNull();
  });

  it('keeps an on-target ring plain (no overflow lap)', async () => {
    await render(<NutritionSummary nutrition={nutrition(2000)} />);
    expect(screen.queryByTestId('calorie-ring-overflow')).toBeNull();
    expect(screen.getByTestId('calorie-ring')).toHaveAccessibilityValue({
      min: 0,
      max: 100,
      now: 100,
    });
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
