// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RebalancePreviewLike } from '@chefer/utils';
import { RebalanceMyWeekButton } from './RebalanceMyWeek';

// WP-07: "Rebalance my week" on the plan — the same offer as after a log, or
// "Your week is on track" when there is nothing to fix. Free for everyone.

const m = vi.hoisted(() => ({
  data: null as RebalancePreviewLike | null,
  query: vi.fn(),
  apply: vi.fn(),
  isLoading: false,
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      mealPlan: { invalidate: vi.fn() },
      dashboard: { invalidate: vi.fn() },
      shoppingList: { invalidate: vi.fn() },
    }),
    mealPlan: {
      previewRebalance: {
        useQuery: (input: unknown) => {
          m.query(input);
          return {
            data: m.data,
            isLoading: m.isLoading,
            isError: false,
            error: null,
            refetch: vi.fn(),
          };
        },
      },
      applyRebalance: {
        useMutation: () => ({
          isPending: false,
          mutate: (input: unknown, opts: { onSuccess?: (data: unknown) => void }) => {
            m.apply(input);
            opts.onSuccess?.({
              rebalanced: true,
              planId: 'plan-1',
              projectedDeviation: 0,
              swaps: [],
            });
          },
        }),
      },
    },
  },
}));

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockReturnValue(undefined); // the Sheet's scroll lock
  window.localStorage.clear();
  vi.clearAllMocks();
  m.data = null;
  m.isLoading = false;
});
afterEach(cleanup);

describe('RebalanceMyWeekButton', () => {
  it('asks the server nothing until it is tapped, then previews THIS plan', () => {
    render(<RebalanceMyWeekButton planId="plan-1" />);
    expect(m.query).not.toHaveBeenCalled();
    const button = screen.getByRole('button', { name: 'Rebalance my week' });
    expect(button.className).toContain('min-h-11');
    fireEvent.click(button);
    expect(m.query).toHaveBeenCalledWith({
      planId: 'plan-1',
      localDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) as string,
    });
  });

  it('nothing to offer: "Your week is on track", no Apply', () => {
    render(<RebalanceMyWeekButton planId="plan-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Rebalance my week' }));
    expect(screen.getByTestId('rebalance-on-track')).toHaveTextContent('Your week is on track');
    expect(screen.queryByRole('button', { name: /Apply/ })).toBeNull();
  });

  it('an offer shows the same Preview · Apply · Not now with the list open, and applies', () => {
    m.data = {
      planId: 'plan-1',
      headline: "You're about 600 kcal over for the week.",
      snacks: [],
      swaps: [
        {
          dayOfWeek: 6,
          mealType: 'dinner',
          previousRecipeId: 'a',
          newRecipeId: 'b',
          newRecipeName: 'Chicken bowl',
          previousProteinG: 20,
          newProteinG: 48,
        },
      ],
    };
    render(<RebalanceMyWeekButton planId="plan-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Rebalance my week' }));
    expect(screen.getByText('Sunday dinner → Chicken bowl (+28 g protein)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Not now' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Apply the rebalance' }));
    expect(m.apply).toHaveBeenCalledWith(
      expect.objectContaining({
        planId: 'plan-1',
        swaps: [expect.objectContaining({ newRecipeId: 'b' })],
      }),
    );
  });
});
