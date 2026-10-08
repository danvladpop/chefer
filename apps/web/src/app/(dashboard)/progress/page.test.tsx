// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ProgressPage from './page';

// UX-FOOD-20 / UX-FOOD-28 on web: only days with something in them count as
// logged, the user picks the window, and the weight card survives a failed
// calorie summary.

const mocks = vi.hoisted(() => ({
  monthly: vi.fn<[], unknown>(),
  monthlyInput: vi.fn<[unknown], unknown>(),
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    tracker: {
      monthlySummary: {
        useQuery: (input: unknown) => {
          mocks.monthlyInput(input);
          return mocks.monthly();
        },
      },
      weightHistory: {
        useQuery: () => ({
          data: [
            { id: 'w1', weightKg: 80, recordedAt: new Date('2026-09-01T08:00:00Z') },
            { id: 'w2', weightKg: 79, recordedAt: new Date('2026-09-20T08:00:00Z') },
          ],
        }),
      },
    },
    preferences: { get: { useQuery: () => ({ data: { chefProfile: { goal: 'MAINTAIN' } } }) } },
  },
}));
vi.mock('@/features/coach/components/WeightEntriesList', () => ({
  WeightEntriesList: () => <div data-testid="weight-entries" />,
}));
vi.mock('@/features/coach/components/WeightLogForm', () => ({
  WeightLogForm: () => <div data-testid="weight-log-form" />,
}));
// Charts are drawn by recharts; these tests are about the page's data and controls.
vi.mock('recharts', () => {
  const Null = () => null;
  return {
    Bar: Null,
    BarChart: Null,
    Legend: Null,
    Line: Null,
    LineChart: Null,
    ReferenceLine: Null,
    ResponsiveContainer: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    Tooltip: Null,
    XAxis: Null,
    YAxis: Null,
  };
});

const day = (date: string, kcal: number, hasLog = kcal > 0) => ({
  date,
  totalKcal: kcal,
  totalProtein: kcal ? 100 : 0,
  totalCarbs: kcal ? 200 : 0,
  totalFat: kcal ? 60 : 0,
  hasLog,
});
const query = (over: Record<string, unknown> = {}) => ({
  data: undefined,
  isLoading: false,
  isError: false,
  isRefetching: false,
  refetch: vi.fn(),
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(cleanup);

describe('ProgressPage (UX-FOOD-20, UX-FOOD-28)', () => {
  it('"Days logged" ignores a day whose entries were all deleted (hasLog but 0 kcal)', () => {
    mocks.monthly.mockReturnValue(
      query({
        data: {
          dailyCalorieTarget: 2000,
          days: [
            day('2026-09-01', 1800),
            day('2026-09-02', 2000),
            day('2026-09-03', 0, true),
            day('2026-09-04', 1900),
          ],
        },
      }),
    );
    render(<ProgressPage />);
    const tile = screen.getByText('Days logged').closest('div')?.parentElement;
    expect(tile?.textContent).toContain('3');
    // The average is over the three real days.
    expect(screen.getByText('1,900')).toBeTruthy();
  });

  it('asks for the window the user picks, anchored on their local date', () => {
    mocks.monthly.mockReturnValue(query({ data: { dailyCalorieTarget: 2000, days: [] } }));
    render(<ProgressPage />);
    const lastInput = () =>
      mocks.monthlyInput.mock.calls.at(-1)?.[0] as { days: number; localDate: string };
    expect(lastInput().days).toBe(28);
    expect(lastInput().localDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    fireEvent.click(screen.getByTestId('progress-range-7'));
    expect(lastInput().days).toBe(7);
    expect(screen.getByTestId('progress-range-7').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByTestId('progress-range-90'));
    expect(lastInput().days).toBe(90);
  });

  it('keeps the weight card when the calorie summary fails', () => {
    mocks.monthly.mockReturnValue(query({ isError: true }));
    render(<ProgressPage />);
    expect(screen.getByText("Couldn't load your progress")).toBeTruthy();
    expect(screen.getByText('Weight Tracking')).toBeTruthy();
    expect(screen.getByTestId('weight-log-form')).toBeTruthy();
  });
});
