import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { compareRows, CompareWeeksSheet } from '../../src/features/meal-plan/compare-weeks-sheet';
import { missLine, PremiumChangesCard } from '../../src/features/meal-plan/premium-changes-card';

// T-10.7: `What Premium changed` — server lines, the honest miss line + Fix it,
// and the compare sheet with a plain fallback when the free week is gone.

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};
const wrap = (ui: ReactElement) =>
  render(<SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>);

let mockPrev: { data?: unknown; isLoading: boolean; isError: boolean };
jest.mock('../../src/lib/trpc', () => ({
  trpc: { mealPlan: { getById: { useQuery: () => mockPrev } } },
}));

const nutrition = (calories: number, protein: number) => ({ calories, protein, carbs: 0, fat: 0 });
const meal = (calories: number, protein: number) => ({
  type: 'dinner',
  recipe: { nutritionInfo: nutrition(calories, protein) },
});

const changes = {
  lines: [
    'Built around your lift days (Mon, Wed and Fri)',
    'Meets your 2,100 kcal target on 5 of 7 days',
  ],
  targetHits: 5,
  missDays: 2,
  misses: [
    { dayOfWeek: 1, deltaKcal: -320 },
    { dayOfWeek: 3, deltaKcal: -310 },
  ],
};

describe('PremiumChangesCard', () => {
  it('renders the lines, the miss line, and Fix it opens the first missed day', async () => {
    const onFixIt = jest.fn();
    await render(
      <PremiumChangesCard
        changes={changes}
        hasPrevious
        onFixIt={onFixIt}
        onCompare={jest.fn()}
        onDismiss={jest.fn()}
      />,
    );
    expect(screen.getByText('What Premium changed')).toBeOnTheScreen();
    expect(screen.getByText('Built around your lift days (Mon, Wed and Fri)')).toBeOnTheScreen();
    expect(screen.getByTestId('premium-changes-miss')).toHaveTextContent(
      'Tue and Thu are about 320 kcal under',
    );
    await fireEvent.press(screen.getByTestId('premium-changes-fix'));
    expect(onFixIt).toHaveBeenCalledWith(1);
  });

  it('has no Fix it when nothing missed, and no Compare without a previous week', async () => {
    await render(
      <PremiumChangesCard
        changes={{ ...changes, misses: [] }}
        hasPrevious={false}
        onFixIt={jest.fn()}
        onCompare={jest.fn()}
        onDismiss={jest.fn()}
      />,
    );
    expect(screen.queryByTestId('premium-changes-fix')).toBeNull();
    expect(screen.queryByTestId('premium-changes-compare')).toBeNull();
    expect(screen.queryByTestId('premium-changes-miss')).toBeNull();
  });

  it('Compare and dismiss call back', async () => {
    const onCompare = jest.fn();
    const onDismiss = jest.fn();
    await render(
      <PremiumChangesCard
        changes={changes}
        hasPrevious
        onFixIt={jest.fn()}
        onCompare={onCompare}
        onDismiss={onDismiss}
      />,
    );
    await fireEvent.press(screen.getByText('Compare with your free week'));
    await fireEvent.press(screen.getByTestId('premium-changes-dismiss'));
    expect(onCompare).toHaveBeenCalled();
    expect(onDismiss).toHaveBeenCalled();
  });
});

describe('missLine', () => {
  it('handles a single day and over-target', () => {
    expect(missLine([{ dayOfWeek: 4, deltaKcal: 450 }])).toBe('Fri is about 450 kcal over');
    expect(missLine([])).toBeNull();
  });
});

describe('CompareWeeksSheet', () => {
  const current = { days: [{ dayOfWeek: 0, meals: [meal(600, 40), meal(700, 30)] }] };

  it('shows both weeks side by side, computed from recipe nutrition', async () => {
    mockPrev = {
      data: { days: [{ dayOfWeek: 0, meals: [meal(900, 50)] }] },
      isLoading: false,
      isError: false,
    };
    await wrap(
      <CompareWeeksSheet visible onClose={jest.fn()} previousPlanId="old" current={current} />,
    );
    expect(screen.getByTestId('compare-weeks-row-0')).toHaveTextContent(/900 kcal · 50 g/);
    expect(screen.getByTestId('compare-weeks-row-0')).toHaveTextContent(/1,300 kcal · 70 g/);
  });

  it('says plainly when the free week is missing', async () => {
    mockPrev = { data: undefined, isLoading: false, isError: true };
    await wrap(
      <CompareWeeksSheet visible onClose={jest.fn()} previousPlanId="old" current={current} />,
    );
    expect(screen.getByTestId('compare-weeks-missing')).toBeOnTheScreen();
  });

  it('compareRows leaves out days planned in neither week', () => {
    expect(compareRows(undefined, current).map((r) => r.dayOfWeek)).toEqual([0]);
  });
});
