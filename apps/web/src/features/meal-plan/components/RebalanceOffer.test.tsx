// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {
  handleRebalancePreview,
  readPendingRebalance,
  readRebalanceOffer,
  type RebalancePreviewLike,
} from '@/features/tracker/lib/rebalance-storage';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RebalanceBanner } from './RebalanceBanner';
import { RebalanceOfferView } from './RebalanceOffer';

// WP-07 (UX-PLAN-09): a log that would change future meals ASKS first —
// Preview · Apply · Not now. Real rebalance-storage, mocked tRPC.

const m = vi.hoisted(() => ({
  apply: vi.fn(),
  applyResult: {
    rebalanced: true,
    planId: 'plan-1',
    projectedDeviation: 0.02,
    swaps: [] as unknown[],
  },
  replace: vi.fn(),
  invalidate: vi.fn(),
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      mealPlan: { invalidate: m.invalidate },
      dashboard: { invalidate: m.invalidate },
      shoppingList: { invalidate: m.invalidate },
    }),
    mealPlan: {
      applyRebalance: {
        useMutation: () => ({
          isPending: false,
          mutate: (
            input: unknown,
            opts: { onSuccess?: (data: unknown) => void; onError?: (e: unknown) => void },
          ) => {
            m.apply(input);
            opts.onSuccess?.(m.applyResult);
          },
        }),
      },
      replaceRecipe: {
        useMutation: () => ({ mutateAsync: m.replace }),
      },
    },
  },
}));

const SWAPS = [
  {
    dayOfWeek: 6,
    mealType: 'dinner',
    slotIndex: 0,
    previousRecipeId: 'old-dinner',
    newRecipeId: 'chicken-bowl',
    previousRecipeName: 'Pasta',
    newRecipeName: 'Chicken bowl',
    previousKcal: 700,
    newKcal: 640,
    previousProteinG: 22,
    newProteinG: 50,
    reason: 'protein' as const,
  },
  {
    dayOfWeek: 5,
    mealType: 'lunch',
    previousRecipeId: 'old-lunch',
    newRecipeId: 'tuna-salad',
    newRecipeName: 'Tuna salad',
    explanation: 'Saturday lunch → Tuna salad (+14 g protein)',
  },
];

const PREVIEW: RebalancePreviewLike = {
  planId: 'plan-1',
  headline: "You're 36 g short on protein this week.",
  swaps: SWAPS,
  snacks: [{ id: 's1', name: 'Greek yogurt', proteinG: 17, kcal: 150 }],
};

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
  m.applyResult = {
    rebalanced: true,
    planId: 'plan-1',
    projectedDeviation: 0.02,
    swaps: SWAPS,
  };
});
afterEach(cleanup);

describe('RebalanceOfferView', () => {
  const renderView = (over: Partial<Parameters<typeof RebalanceOfferView>[0]> = {}) =>
    render(<RebalanceOfferView preview={PREVIEW} onApply={vi.fn()} onNotNow={vi.fn()} {...over} />);

  it('leads with the headline and offers Preview, Apply and Not now', () => {
    renderView();
    expect(screen.getByText("You're 36 g short on protein this week.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Preview' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply all 2 changes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Not now' })).toBeInTheDocument();
    // Nothing is listed (or changed) until the user opens the preview.
    expect(screen.queryByText(/Chicken bowl/)).toBeNull();
  });

  it('Preview lists each swap with its one-line explanation and the protein snack', () => {
    renderView();
    const toggle = screen.getByRole('button', { name: 'Preview' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    // Built from the numbers (describeRebalanceSwap)…
    expect(
      screen.getByText('Sunday dinner → Chicken bowl (+28 g protein, −60 kcal)'),
    ).toBeInTheDocument();
    // …or the API's own explanation when it sent one.
    expect(screen.getByText('Saturday lunch → Tuna salad (+14 g protein)')).toBeInTheDocument();
    expect(screen.getByText('Greek yogurt (+17 g protein, 150 kcal)')).toBeInTheDocument();
  });

  it('stacks the actions UNDER the text and keeps every action a 44px target', () => {
    renderView();
    const offer = screen.getByTestId('rebalance-offer');
    expect(offer.className).toContain('flex-col');
    const actions = screen.getByRole('button', { name: 'Not now' }).parentElement;
    expect(actions?.className).toContain('flex-wrap');
    for (const name of ['Preview', 'Apply all 2 changes', 'Not now']) {
      expect(screen.getByRole('button', { name }).className).toContain('min-h-11');
    }
    // No horizontal overflow at 320 px: text blocks can shrink.
    expect(
      screen.getByText("You're 36 g short on protein this week.").parentElement?.className,
    ).toContain('min-w-0');
  });

  it('with only protein snacks to offer there is no Apply', () => {
    renderView({ preview: { ...PREVIEW, swaps: [] } });
    expect(screen.queryByRole('button', { name: /Apply/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(screen.getByText('Greek yogurt (+17 g protein, 150 kcal)')).toBeInTheDocument();
  });
});

describe('RebalanceBanner offer flow', () => {
  const offerParked = () => {
    handleRebalancePreview(PREVIEW);
  };

  it('shows a parked offer, applies it through applyRebalance, then offers Undo', async () => {
    offerParked();
    render(<RebalanceBanner />);
    expect(await screen.findByTestId('rebalance-offer')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Apply all 2 changes' }));

    expect(m.apply).toHaveBeenCalledTimes(1);
    expect(m.apply).toHaveBeenCalledWith({
      planId: 'plan-1',
      swaps: [
        {
          dayOfWeek: 6,
          mealType: 'dinner',
          slotIndex: 0,
          previousRecipeId: 'old-dinner',
          newRecipeId: 'chicken-bowl',
        },
        {
          dayOfWeek: 5,
          mealType: 'lunch',
          previousRecipeId: 'old-lunch',
          newRecipeId: 'tuna-salad',
        },
      ],
      localDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) as string,
    });
    // The week data refetches, the offer is retired and the applied banner takes over.
    expect(m.invalidate).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByTestId('rebalance-offer')).toBeNull());
    expect(readRebalanceOffer()).toBeNull();
    expect(screen.getByTestId('rebalance-applied').textContent).toContain(
      'I adjusted Sunday dinner and Saturday lunch',
    );
    expect(readPendingRebalance()?.swaps).toHaveLength(2);

    // Undo puts every previous recipe back, as an unpinned slot.
    fireEvent.click(screen.getByRole('button', { name: /Undo/ }));
    await waitFor(() => expect(m.replace).toHaveBeenCalledTimes(2));
    expect(m.replace).toHaveBeenCalledWith({
      planId: 'plan-1',
      dayOfWeek: 6,
      mealType: 'dinner',
      slotIndex: 0,
      recipeId: 'old-dinner',
      pinned: false,
    });
    expect(m.replace).toHaveBeenCalledWith({
      planId: 'plan-1',
      dayOfWeek: 5,
      mealType: 'lunch',
      recipeId: 'old-lunch',
      pinned: false,
    });
  });

  it('Not now changes nothing: no apply call, no pending Undo, the offer is gone', async () => {
    offerParked();
    render(<RebalanceBanner />);
    fireEvent.click(await screen.findByRole('button', { name: 'Not now' }));
    expect(m.apply).not.toHaveBeenCalled();
    expect(m.replace).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByTestId('rebalance-offer')).toBeNull());
    expect(screen.queryByTestId('rebalance-applied')).toBeNull();
    expect(readRebalanceOffer()).toBeNull();
    expect(readPendingRebalance()).toBeNull();
  });

  it('a log that finds nothing to offer retires an older offer', async () => {
    offerParked();
    render(<RebalanceBanner />);
    await screen.findByTestId('rebalance-offer');
    act(() => handleRebalancePreview(null));
    await waitFor(() => expect(screen.queryByTestId('rebalance-offer')).toBeNull());
  });

  it('on the plan page only that plan’s offer shows', async () => {
    offerParked();
    render(<RebalanceBanner planId="another-plan" />);
    await waitFor(() => expect(readRebalanceOffer()).not.toBeNull());
    expect(screen.queryByTestId('rebalance-offer')).toBeNull();
  });

  it('a stale offer (the week moved on) says so and swaps nothing', async () => {
    m.applyResult = { rebalanced: false, planId: 'plan-1', projectedDeviation: 0, swaps: [] };
    offerParked();
    render(<RebalanceBanner />);
    fireEvent.click(await screen.findByRole('button', { name: 'Apply all 2 changes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Those meals have changed since, so nothing was swapped.',
    );
    expect(readPendingRebalance()).toBeNull();
  });
});
