// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PremiumChangesCard } from './PremiumChangesCard';

// T-10.7: `What Premium changed` — server lines, miss lines with Fix it, the
// compare dialog over `mealPlan.getById`, dismissal per plan id.

const nutrition = (calories: number, protein: number) => ({
  calories,
  protein,
  carbs: 10,
  fat: 10,
  fiber: 1,
});
const day = (dayOfWeek: number, calories: number, protein: number) => ({
  dayOfWeek,
  meals: [{ type: 'dinner', recipe: { nutritionInfo: nutrition(calories, protein) } }],
});

const m = vi.hoisted(() => ({ requested: [] as unknown[] }));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    mealPlan: {
      getById: {
        useQuery: (input: unknown, opts: { enabled: boolean }) => {
          if (opts.enabled) m.requested.push(input);
          return {
            data: opts.enabled
              ? { planId: 'old', days: [day(0, 1500, 60), day(1, 1400, 55)] }
              : undefined,
            isLoading: false,
            isError: false,
          };
        },
      },
    },
  },
}));

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  m.requested.length = 0;
});

const changes = {
  lines: [
    'Built around your lift days (Mon and Wed)',
    'Meets your 2,100 kcal target on 5 of 7 days',
  ],
  targetHits: 5,
  missDays: 2,
  misses: [
    { dayOfWeek: 3, deltaKcal: -300 },
    { dayOfWeek: 5, deltaKcal: -300 },
  ],
};

const renderCard = (onFix = vi.fn()) =>
  render(
    <PremiumChangesCard
      planId="new"
      previousPlanId="old"
      changes={changes}
      currentDays={[day(0, 2100, 150), day(1, 2050, 140)]}
      onFix={onFix}
    />,
  );

describe('PremiumChangesCard', () => {
  it('lists the lines and a miss line whose Fix it opens that day', () => {
    const onFix = vi.fn();
    renderCard(onFix);
    expect(screen.getByRole('heading', { name: 'What Premium changed' })).toBeTruthy();
    expect(screen.getByText('Built around your lift days (Mon and Wed)')).toBeTruthy();
    expect(screen.getByText('Thu and Sat are about 300 kcal under')).toBeTruthy();
    fireEvent.click(screen.getByTestId('premium-changes-fix'));
    expect(onFix).toHaveBeenCalledWith(3);
  });

  it('Compare with your free week loads the previous plan and shows both weeks', () => {
    renderCard();
    expect(m.requested).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Compare with your free week' }));
    expect(m.requested).toContainEqual({ planId: 'old' });
    const table = screen.getByTestId('premium-compare');
    expect(table.textContent).toContain('1,500 kcal · 60 g');
    expect(table.textContent).toContain('2,100 kcal · 150 g');
  });

  it('dismiss is remembered per plan id', () => {
    const { unmount } = renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss what Premium changed' }));
    expect(screen.queryByTestId('premium-changes')).toBeNull();
    unmount();
    renderCard();
    expect(screen.queryByTestId('premium-changes')).toBeNull();
  });
});
