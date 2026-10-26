// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WeeklyRecapDto } from '@chefer/types';
import RecapPage from './page';

// Lane E2: the web recap shows only what happened; a quiet week says so.

const RECAP: WeeklyRecapDto = {
  weekStart: '2026-10-12',
  label: '12–18 Oct',
  food: {
    plannedMeals: 14,
    cookedFromPlan: 9,
    newRecipesTried: 1,
    newRecipes: [{ id: 'a', name: 'Lemon pasta' }],
    proteinDays: null,
  },
  gym: { sessions: 2, prCount: 0, prs: [], streakWeeks: 3 },
  empty: false,
};

const m = vi.hoisted(() => ({ data: undefined as WeeklyRecapDto | undefined }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock('@/lib/analytics', () => ({ capture: vi.fn() }));
vi.mock('@/features/share/share-card-button', () => ({
  ShareCardButton: ({ label }: { label: string }) => <button type="button">{label}</button>,
}));
vi.mock('@/lib/trpc', () => ({
  trpc: {
    recap: {
      week: {
        useQuery: () => ({ data: m.data, isError: false, isRefetching: false, refetch: vi.fn() }),
      },
    },
  },
}));

afterEach(cleanup);
beforeEach(() => {
  m.data = RECAP;
});

describe('Recap page (lane E2)', () => {
  it('lists the facts without denominators or zero rows', () => {
    render(<RecapPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Your week in review' })).toBeTruthy();
    expect(screen.getByText('9 meals cooked from your plan')).toBeTruthy();
    expect(screen.getByText('1 new recipe tried')).toBeTruthy();
    expect(screen.getByText('2 workouts')).toBeTruthy();
    expect(screen.getByText('3-week streak')).toBeTruthy();
    expect(screen.queryByText(/personal best/)).toBeNull();
    expect(screen.queryByText(/of 14/)).toBeNull();
    // No protein target: no protein pick on the share card.
    expect(screen.queryByText('Protein days')).toBeNull();
  });

  it('a quiet week says so and offers no share', () => {
    m.data = { ...RECAP, empty: true };
    render(<RecapPage />);
    expect(screen.getByTestId('recap-quiet').textContent).toContain('A quiet week');
    expect(screen.queryByRole('button', { name: 'Share your week' })).toBeNull();
  });
});
