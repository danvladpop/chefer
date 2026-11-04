// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { COACHING_DATA_COPY, type ClientWeekSummaryDto } from '@chefer/types';
import { FoodTab } from './FoodTab';
import { WeekSummaryCard } from './WeekSummaryCard';

// Lane K2: the client's "Last 7 days" card and Food tab on web (mobile twin:
// tests/unit/trainer-client-food.test.tsx). Food and weight are asked only while shared.

const m = vi.hoisted(
  (): { week: unknown; food: ReturnType<typeof vi.fn>; weight: ReturnType<typeof vi.fn> } => ({
    week: null,
    food: vi.fn(),
    weight: vi.fn(),
  }),
);

vi.mock('../use-trainer-unit', () => ({ useTrainerUnit: () => 'KG' }));
vi.mock('@/lib/trpc', () => ({
  trpc: {
    trainer: {
      client: {
        weekSummary: { useQuery: () => ({ isPending: false, isError: false, data: m.week }) },
        food: {
          useQuery: (...args: unknown[]) => {
            m.food(...args);
            return {
              isPending: false,
              isError: false,
              data: {
                numbers: 'FULL',
                sharedSince: '2026-10-02T09:00:00.000Z',
                days: [
                  {
                    date: '2026-10-07',
                    mealsLogged: 1,
                    kcal: 700,
                    proteinG: 35,
                    targetKcal: 2000,
                    targetProteinG: 125,
                    plan: null,
                    entries: [
                      {
                        name: 'Shawarma',
                        mealType: 'lunch',
                        kcal: 700,
                        proteinG: 35,
                        onPlan: false,
                      },
                    ],
                  },
                ],
              },
            };
          },
        },
        weight: {
          useQuery: (...args: unknown[]) => {
            m.weight(...args);
            return { isPending: false, isError: false, data: { sharedSince: '', entries: [] } };
          },
        },
      },
    },
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const week = (over: Partial<ClientWeekSummaryDto> = {}): ClientWeekSummaryDto => ({
  from: '2026-10-01',
  to: '2026-10-07',
  workouts: { done: 1, goal: 3 },
  sharing: { food: false, weight: false },
  food: null,
  weight: null,
  ...over,
});

describe('WeekSummaryCard', () => {
  it('nothing shared: workouts, and a line saying food and weight are not shared', () => {
    m.week = week();
    render(<WeekSummaryCard clientId="c1" firstName="Maria" />);
    expect(screen.getByRole('heading', { name: 'Last 7 days' })).toBeInTheDocument();
    expect(screen.getByText('1 of 3 workouts')).toBeInTheDocument();
    expect(screen.getByText(COACHING_DATA_COPY.week.notShared('Maria'))).toBeInTheDocument();
    expect(screen.queryByTestId('trainer-week-food')).toBeNull();
  });

  it('shared food: days logged, averages and plan adherence', () => {
    m.week = week({
      sharing: { food: true, weight: false },
      food: {
        numbers: 'FULL',
        daysLogged: 4,
        mealsLogged: 9,
        avgKcal: 1850,
        avgProteinG: 110,
        targetKcal: 2000,
        targetProteinG: 125,
        planAdherence: null,
      },
    });
    render(<WeekSummaryCard clientId="c1" firstName="Maria" />);
    const food = screen.getByTestId('trainer-week-food');
    expect(food).toHaveTextContent('Food logged 4 of 7 days');
    expect(food).toHaveTextContent('1,850 of 2,000 kcal a day');
    expect(food).toHaveTextContent('No meal plan this week');
  });
});

describe('FoodTab', () => {
  it('asks only for what is shared', () => {
    render(<FoodTab clientId="c1" firstName="Maria" sharing={{ food: true, weight: false }} />);
    expect(screen.getByTestId('trainer-food-day-2026-10-07')).toHaveTextContent(
      '1 meal · 700 / 2,000 kcal · 35 / 125 g protein',
    );
    expect(screen.getByText(COACHING_DATA_COPY.weight.notShared('Maria'))).toBeInTheDocument();
    expect(m.food).toHaveBeenCalled();
    expect(m.weight).not.toHaveBeenCalled();
  });
});
