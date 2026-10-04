// @vitest-environment jsdom
import { NumbersModeProvider } from '@/features/numbers-mode/numbers-mode';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChefReviewBanner } from './ChefReviewBanner';

// WP-08: the weekly review in protein-only mode. The review text is composed on
// the server with calorie figures; protein-only drops those lines, swaps the
// kcal average for the protein average (from the tracker's week summary) and
// hides the calorie-budget change. The full review comes back with the full mode.

const m = vi.hoisted<{ review: unknown; week: unknown }>(() => ({
  review: null,
  week: undefined,
}));
vi.mock('@/lib/trpc', () => ({
  trpc: {
    coach: { currentReview: { useQuery: () => ({ data: m.review }) } },
    tracker: { weeklySummary: { useQuery: () => ({ data: m.week }) } },
  },
}));
vi.mock('@/lib/analytics', () => ({ capture: vi.fn() }));
vi.mock('@/hooks/useUnitSystem', () => ({ useUnitSystem: () => 'METRIC' }));
vi.mock('@/features/premium/components/UpgradeButton', () => ({ UpgradeButton: () => null }));

afterEach(cleanup);

const week = {
  dailyCalorieTarget: 2200,
  days: [
    {
      date: '2026-10-01',
      hasLog: true,
      totalKcal: 2000,
      totalProtein: 110,
      totalCarbs: 0,
      totalFat: 0,
    },
    {
      date: '2026-10-02',
      hasLog: true,
      totalKcal: 2100,
      totalProtein: 114,
      totalCarbs: 0,
      totalFat: 0,
    },
    {
      date: '2026-10-03',
      hasLog: true,
      totalKcal: 1900,
      totalProtein: 112,
      totalCarbs: 0,
      totalFat: 0,
    },
  ],
};

const full = {
  status: 'full',
  review: {
    reviewText:
      'Steady week.\nYou averaged 2,100 kcal a day.\nYour calorie budget moved.\nKeep your protein up.',
    adherencePct: 71,
    avgDailyKcal: 2100,
    weightTrendKg: null,
    adjustmentKcal: 100,
    savedEur: null,
  },
};
const teaser = {
  status: 'teaser',
  firstLine: 'You averaged 2,100 kcal and logged 5 days.',
};

const view = (mode: string | null) => (
  <NumbersModeProvider mode={mode}>
    <ChefReviewBanner />
  </NumbersModeProvider>
);

describe('Weekly review — protein-only mode (WP-08)', () => {
  it('shows the protein average, drops the calorie lines and the budget change', () => {
    m.review = full;
    m.week = week;
    render(view('PROTEIN_ONLY'));
    expect(screen.getByTestId('coach-review-protein-average').textContent).toBe(
      'This week you averaged 112 g protein a day',
    );
    expect(screen.getByText('Steady week.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /See full review/ }));
    const sheet = screen.getByText('Keep your protein up.');
    expect(sheet).toBeTruthy();
    expect(screen.getByText('Avg protein').previousElementSibling?.textContent).toBe('112 g');
    expect(document.body.textContent).not.toMatch(/kcal|calorie/i);
  });

  it('switching back restores the kcal average, the budget change and the whole text', () => {
    m.review = full;
    m.week = week;
    const { rerender } = render(view('PROTEIN_ONLY'));
    rerender(view('FULL'));
    expect(screen.queryByTestId('coach-review-protein-average')).toBeNull();
    expect(document.body.textContent).toMatch(/2100/);
    expect(document.body.textContent).toMatch(/kcal\/day avg/);
    expect(document.body.textContent).toMatch(/\+100 kcal/);
    fireEvent.click(screen.getByRole('button', { name: /See full review/ }));
    expect(screen.getByText('You averaged 2,100 kcal a day.')).toBeTruthy();
  });

  it('the free teaser leaves out a first line that is all about calories', () => {
    m.review = teaser;
    m.week = week;
    render(view('PROTEIN_ONLY'));
    expect(screen.getByText(/Your chef noticed something about your week/)).toBeTruthy();
    expect(screen.queryByText(/averaged 2,100 kcal/)).toBeNull();
    expect(document.body.textContent).not.toMatch(/kcal/i);
  });

  it('too few logged days: no average, and still no kcal', () => {
    m.review = full;
    m.week = { ...week, days: week.days.slice(0, 1) };
    render(view('PROTEIN_ONLY'));
    expect(screen.queryByTestId('coach-review-protein-average')).toBeNull();
    expect(document.body.textContent).not.toMatch(/kcal/i);
  });
});
