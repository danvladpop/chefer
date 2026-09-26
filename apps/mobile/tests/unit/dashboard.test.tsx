import { render, screen, userEvent } from '@testing-library/react-native';
import { NutritionSummary } from '../../src/features/dashboard/components/nutrition-summary';
import { WeekOutlook } from '../../src/features/dashboard/components/week-outlook';

const nutrition = (plannedKcal: number, eatenKcal = 0) => ({
  dailyCalorieTarget: 2000,
  plannedKcal,
  eatenKcal,
  protein: { planned: 100, targetG: 140, eaten: 60 },
  carbs: { planned: 180, targetG: 220, eaten: 90 },
  fat: { planned: 50, targetG: 70, eaten: 20 },
});

describe('NutritionSummary', () => {
  // The chip judges today's PLAN — same thresholds as web review P-2.
  it.each([
    [0, 'Nothing planned'],
    [1500, 'Plan under target'], // ratio 0.75 < 0.85
    [1900, 'Plan on track'], // 0.95
    [2200, 'Plan over target'], // 1.1 > 1.05
  ])('%i kcal planned → "%s"', async (planned, label) => {
    await render(<NutritionSummary nutrition={nutrition(planned)} />);
    expect(screen.getByTestId('nutrition-status')).toHaveTextContent(label);
  });

  it('the ring shows what was EATEN against the target (audit F-DASH-1-2)', async () => {
    await render(<NutritionSummary nutrition={nutrition(1900, 800)} />);
    const ring = screen.getByTestId('calorie-ring');
    expect(ring).toHaveAccessibleName('800 of 2,000 kcal eaten today');
    expect(ring).toHaveAccessibilityValue({ min: 0, max: 100, now: 40 });
    expect(screen.getByText('of 2,000 kcal eaten')).toBeOnTheScreen();
    expect(screen.getByTestId('calorie-remaining')).toHaveTextContent('1,900 planned · 1,200 left');
    expect(screen.getByText('60g / 140g')).toBeOnTheScreen();
    expect(screen.getByTestId('calorie-count')).toHaveAccessibleName('800');
    expect(await screen.findByText('800')).toBeOnTheScreen();
  });

  it('shows the eaten total immediately under reduced motion', async () => {
    (globalThis as typeof globalThis & { __REDUCED_MOTION__?: boolean }).__REDUCED_MOTION__ = true;
    try {
      await render(<NutritionSummary nutrition={nutrition(1900, 1234)} />);
      expect(screen.getByTestId('calorie-count')).toHaveTextContent('1,234');
    } finally {
      (globalThis as typeof globalThis & { __REDUCED_MOTION__?: boolean }).__REDUCED_MOTION__ =
        false;
    }
  });

  it('marks eaten calories and macros over target (MO-06: 2,810 of 2,728; fat 81 g of 62 g)', async () => {
    await render(
      <NutritionSummary
        nutrition={{
          dailyCalorieTarget: 2728,
          plannedKcal: 2500,
          eatenKcal: 2810,
          protein: { planned: 120, targetG: 140, eaten: 120 },
          carbs: { planned: 250, targetG: 300, eaten: 250 },
          fat: { planned: 60, targetG: 62, eaten: 81 },
        }}
      />,
    );
    expect(screen.getByTestId('calorie-ring-overflow')).toBeOnTheScreen();
    expect(screen.getByTestId('calorie-remaining')).toHaveTextContent('2,500 planned · 82 over');
    expect(screen.getByTestId('macro-fat-cap')).toBeOnTheScreen();
    expect(screen.queryByTestId('macro-protein-cap')).toBeNull();
    expect(screen.queryByTestId('macro-carbs-cap')).toBeNull();
  });

  it('keeps an on-target ring plain (no overflow lap)', async () => {
    await render(<NutritionSummary nutrition={nutrition(2000, 2000)} />);
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
