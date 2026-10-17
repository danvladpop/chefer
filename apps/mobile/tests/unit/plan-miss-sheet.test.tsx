import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { missScaleFactor, PlanMissSheet } from '../../src/features/nutrition/plan-miss-sheet';

// T-11.3: what to do about a planned day that misses its target.

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};
const wrap = (ui: ReactElement) =>
  render(<SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>);

const mockScale = jest.fn();
jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    mealPlan: {
      scaleDay: {
        useMutation: (opts?: { onSuccess?: (d: { kcal: number; protein: number }) => void }) => ({
          mutate: (input: unknown) => {
            mockScale(input);
            opts?.onSuccess?.({ kcal: 1900, protein: 120 });
          },
          isPending: false,
          isError: false,
        }),
      },
    },
  },
}));

const base = {
  visible: true,
  onClose: jest.fn(),
  planId: 'p1',
  dayOfWeek: 1,
  dayName: 'Tuesday',
  kcal: 1500,
  protein: 90,
  calorieTarget: 2000,
  onApplied: jest.fn(),
  onAddSnack: jest.fn(),
};

beforeEach(() => jest.clearAllMocks());

describe('PlanMissSheet', () => {
  it('previews bigger portions without applying, then applies on tap', async () => {
    await wrap(<PlanMissSheet {...base} goal="MAINTAIN" />);
    expect(mockScale).toHaveBeenCalledWith({
      planId: 'p1',
      dayOfWeek: 1,
      factor: 1.33,
      apply: false,
    });
    expect(screen.getByTestId('plan-miss-preview')).toHaveTextContent(
      'Would be 1,900 kcal · 120 g protein',
    );
    await fireEvent.press(screen.getByTestId('plan-miss-portions'));
    expect(mockScale).toHaveBeenLastCalledWith({
      planId: 'p1',
      dayOfWeek: 1,
      factor: 1.33,
      apply: true,
    });
    expect(base.onApplied).toHaveBeenCalled();
  });

  it('offers Add a snack when the goal is not weight loss', async () => {
    await wrap(<PlanMissSheet {...base} goal="GAIN_MUSCLE" />);
    expect(screen.getByText('Add a snack')).toBeOnTheScreen();
    expect(screen.getByText('Keep it')).toBeOnTheScreen();
  });

  it('never offers Add a snack on LOSE_WEIGHT', async () => {
    await wrap(<PlanMissSheet {...base} goal="LOSE_WEIGHT" />);
    expect(screen.queryByText('Add a snack')).toBeNull();
    expect(screen.getByText('Bigger portions')).toBeOnTheScreen();
    expect(screen.getByText('Keep it')).toBeOnTheScreen();
  });

  it('hides Add a snack while the goal is unknown', async () => {
    await wrap(<PlanMissSheet {...base} goal={undefined} />);
    expect(screen.queryByText('Add a snack')).toBeNull();
  });

  it('a day over target offers smaller portions and no snack', async () => {
    await wrap(<PlanMissSheet {...base} kcal={2600} goal="MAINTAIN" />);
    expect(screen.getByText('Smaller portions')).toBeOnTheScreen();
    expect(screen.queryByText('Add a snack')).toBeNull();
  });

  it('Keep it just closes', async () => {
    await wrap(<PlanMissSheet {...base} goal="MAINTAIN" />);
    await fireEvent.press(screen.getByTestId('plan-miss-keep'));
    expect(base.onClose).toHaveBeenCalled();
    expect(base.onApplied).not.toHaveBeenCalled();
  });
});

// WP-07 / UX-PLAN-08: a protein-gap fix on a weight-loss goal is capped at +10 %
// of the day, never "Bigger portions (+503 kcal)"; a higher-protein route leads.
describe('PlanMissSheet — loss goal with a protein gap', () => {
  const proteinMiss = { ...base, kcal: 1950, protein: 90, proteinGapG: 60 };

  it('caps the offered portion increase at +10 % and previews that, not the full fix', async () => {
    await wrap(<PlanMissSheet {...proteinMiss} goal="LOSE_WEIGHT" />);
    expect(mockScale).toHaveBeenCalledWith({
      planId: 'p1',
      dayOfWeek: 1,
      factor: 1.1,
      apply: false,
    });
    expect(screen.queryByText(/503/)).toBeNull();
  });

  it('a non-loss goal still gets the full protein fix', async () => {
    await wrap(<PlanMissSheet {...proteinMiss} goal="MAINTAIN" />);
    expect(mockScale).toHaveBeenCalledWith(expect.objectContaining({ factor: 1.5, apply: false }));
    expect(screen.queryByTestId('plan-miss-protein-hint')).toBeNull();
  });

  it('points at a higher-protein swap or snack and runs the week rebalance check', async () => {
    const onRebalance = jest.fn();
    await wrap(<PlanMissSheet {...proteinMiss} goal="LOSE_WEIGHT" onRebalance={onRebalance} />);
    expect(screen.getByTestId('plan-miss-protein-hint')).toHaveTextContent(
      'A higher-protein swap or a protein snack closes this gap without many extra calories.',
    );
    await fireEvent.press(screen.getByTestId('plan-miss-rebalance'));
    expect(base.onClose).toHaveBeenCalled();
    expect(onRebalance).toHaveBeenCalled();
  });

  it('a calorie miss on a loss goal is unchanged (the cap is for protein fixes)', async () => {
    await wrap(<PlanMissSheet {...base} goal="LOSE_WEIGHT" />);
    expect(mockScale).toHaveBeenCalledWith(expect.objectContaining({ factor: 1.33 }));
    expect(screen.queryByTestId('plan-miss-protein-hint')).toBeNull();
  });
});

describe('missScaleFactor', () => {
  it('clamps to the server bounds and ignores near-1 factors', () => {
    const args = { protein: 90, proteinGapG: undefined };
    expect(missScaleFactor({ ...args, kcal: 500, calorieTarget: 2000 })).toBe(1.5);
    expect(missScaleFactor({ ...args, kcal: 4000, calorieTarget: 2000 })).toBe(0.75);
    expect(missScaleFactor({ ...args, kcal: 1900, calorieTarget: 2000 })).toBeNull();
  });
  it('falls back to the protein gap when calories are on target', () => {
    expect(
      missScaleFactor({ kcal: 2000, protein: 100, calorieTarget: 2000, proteinGapG: 30 }),
    ).toBe(1.3);
  });
  it('caps a protein-driven increase on a loss goal at 1.1, and drops it when the cap leaves nothing', () => {
    const args = { kcal: 2000, protein: 100, calorieTarget: 2000 };
    expect(missScaleFactor({ ...args, proteinGapG: 50, goal: 'LOSE_WEIGHT' })).toBe(1.1);
    expect(missScaleFactor({ ...args, proteinGapG: 50, goal: 'MAINTAIN' })).toBe(1.5);
    expect(
      missScaleFactor({ ...args, protein: 200, proteinGapG: 4, goal: 'LOSE_WEIGHT' }),
    ).toBeNull();
  });
});
