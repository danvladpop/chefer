// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UseWeekAgainSheet } from './UseWeekAgainSheet';

// UX-PLAN-11: a past week can be copied into THIS or NEXT week.

const m = vi.hoisted(() => ({ mutate: vi.fn() }));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      mealPlan: { invalidate: vi.fn() },
      dashboard: { invalidate: vi.fn() },
      tracker: { invalidate: vi.fn() },
      shoppingList: { invalidate: vi.fn() },
    }),
    mealPlan: {
      restore: {
        useMutation: () => ({ mutate: m.mutate, isPending: false, error: null, reset: vi.fn() }),
      },
    },
  },
}));

afterEach(() => {
  cleanup();
  m.mutate.mockClear();
});

describe('UseWeekAgainSheet', () => {
  it('copies into this week or next week, never silently into the past one', () => {
    render(<UseWeekAgainSheet planId="p1" weekLabel="07 Sep" open onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('use-again-this-week'));
    expect(m.mutate).toHaveBeenLastCalledWith({ planId: 'p1', weekOffset: 0 });
    fireEvent.click(screen.getByTestId('use-again-next-week'));
    expect(m.mutate).toHaveBeenLastCalledWith({ planId: 'p1', weekOffset: 1 });
  });

  it('names the week being copied and where the replaced plan goes', () => {
    render(<UseWeekAgainSheet planId="p1" weekLabel="07 Sep" open onClose={vi.fn()} />);
    expect(screen.getByText('Week of 07 Sep')).toBeTruthy();
    expect(screen.getByTestId('use-again-body').textContent).toMatch(/stays in My weeks/);
  });
});
