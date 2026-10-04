// @vitest-environment jsdom
import { fakeSlotFlow } from '@/features/tracker/lib/slot-flow.fixture';
import { capture } from '@/lib/analytics';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HERO_LOGGED_HOLD_MS } from '@chefer/utils';
import { NextMealCard } from './next-meal-card';

// P2-2: Today logs the planned meal in one tap through tracker.logRecipe.

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  invalidateSummary: vi.fn(),
  onSuccess: undefined as undefined | ((data: { rebalance: null }) => void),
  undo: vi.fn(),
  onUndoSuccess: undefined as undefined | (() => void),
}));

vi.mock('next/image', () => ({
  default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} />,
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@/features/tracker/lib/rebalance-storage', () => ({ handleRebalanceResult: vi.fn() }));
vi.mock('@/lib/analytics', () => ({ capture: vi.fn() }));
vi.mock('@/lib/recipe-image', () => ({ getRecipeImageProps: () => ({ src: '/x.jpg' }) }));
vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      dashboard: { summary: { invalidate: mocks.invalidateSummary } },
      tracker: { getDay: { invalidate: vi.fn() }, weeklySummary: { invalidate: vi.fn() } },
    }),
    tracker: {
      logRecipe: {
        useMutation: (opts: { onSuccess: (data: { rebalance: null }) => void }) => {
          mocks.onSuccess = opts.onSuccess;
          return { mutate: mocks.mutate, isPending: false, isError: false, error: null };
        },
      },
      unlogRecipe: {
        useMutation: (opts: { onSuccess: () => void }) => {
          mocks.onUndoSuccess = opts.onSuccess;
          return { mutate: mocks.undo, isPending: false, isError: false, error: null };
        },
      },
    },
  },
}));

const MEAL = {
  mealType: 'dinner',
  recipe: {
    id: 'curry',
    name: 'Lentil Curry',
    description: 'Warm and filling',
    imageUrl: null,
    kcal: 700,
    servings: 1,
    prepTimeMins: 10,
    cookTimeMins: 30,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(cleanup);

describe('NextMealCard analytics (UX-PO-02)', () => {
  it('a logged planned meal fires meal_logged as planned, with its slot', () => {
    render(<NextMealCard meal={MEAL} isTomorrow={false} />);
    expect(capture).not.toHaveBeenCalled();
    act(() => mocks.onSuccess?.({ rebalance: null }));
    expect(capture).toHaveBeenCalledWith('meal_logged', { source: 'planned', mealType: 'dinner' });
  });
});

describe('NextMealCard', () => {
  it('"I ate this" logs the planned recipe for today, one portion', () => {
    render(<NextMealCard meal={MEAL} isTomorrow={false} />);
    fireEvent.click(screen.getByTestId('today-ate-this'));
    const [args] = mocks.mutate.mock.calls[0] as [Record<string, unknown>];
    expect(args).toMatchObject({ recipeId: 'curry', mealType: 'dinner', portionMultiplier: 1 });
    expect(String(args['date'])).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('refreshes Today and confirms what was logged', () => {
    render(<NextMealCard meal={MEAL} isTomorrow={false} />);
    act(() => mocks.onSuccess?.({ rebalance: null }));
    expect(mocks.invalidateSummary).toHaveBeenCalled();
    expect(screen.getByTestId('today-logged-status').textContent).toContain('Lentil Curry');
  });

  it("logs the plan slot's portion (P1-1) and shows it", () => {
    render(<NextMealCard meal={{ ...MEAL, portion: 1.5 }} isTomorrow={false} />);
    fireEvent.click(screen.getByTestId('today-ate-this'));
    expect(mocks.mutate).toHaveBeenCalledWith(expect.objectContaining({ portionMultiplier: 1.5 }));
    expect(screen.getByText(/1½×/)).toBeTruthy();
  });

  it('sends the plan slot, so the second of two identical snacks logs separately', () => {
    render(<NextMealCard meal={{ ...MEAL, mealType: 'snack', slotIndex: 3 }} isTomorrow={false} />);
    fireEvent.click(screen.getByTestId('today-ate-this'));
    expect(mocks.mutate).toHaveBeenCalledWith(expect.objectContaining({ slotIndex: 3 }));
  });

  it('omits slotIndex when the summary has none', () => {
    render(<NextMealCard meal={MEAL} isTomorrow={false} />);
    fireEvent.click(screen.getByTestId('today-ate-this'));
    const [args] = mocks.mutate.mock.calls[0] as [Record<string, unknown>];
    expect(args).not.toHaveProperty('slotIndex');
  });

  it('shows the real time (prep + cook), not prep alone (F-PM-10)', () => {
    render(<NextMealCard meal={MEAL} isTomorrow={false} />);
    expect(screen.getByText('40 min')).toBeTruthy();
  });

  it("tomorrow's meal can be viewed but not logged", () => {
    render(<NextMealCard meal={MEAL} isTomorrow />);
    expect(screen.queryByTestId('today-ate-this')).toBeNull();
    expect(screen.getByText('Tomorrow')).toBeTruthy();
  });

  // UX-FOOD-15: the card used to advance to the next meal under the pointer, so
  // a double tap logged dinner at 11 am.
  describe('"Logged ✓ · Undo" hold (UX-FOOD-15)', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    const logged = () => {
      render(<NextMealCard meal={MEAL} isTomorrow={false} />);
      act(() => mocks.onSuccess?.({ rebalance: null }));
    };

    it('shows a disabled "Logged ✓" with Undo, and a second tap logs nothing', () => {
      logged();
      const ate = screen.getByTestId('today-ate-this');
      expect(ate.textContent).toContain('Logged ✓');
      expect((ate as HTMLButtonElement).disabled).toBe(true);
      expect(screen.getByTestId('today-undo-logged').textContent).toBe('Undo');
      fireEvent.click(ate);
      expect(mocks.mutate).not.toHaveBeenCalled();
    });

    it('releases after about two seconds', () => {
      logged();
      act(() => {
        vi.advanceTimersByTime(HERO_LOGGED_HOLD_MS + 50);
      });
      const ate = screen.getByTestId('today-ate-this');
      expect(ate.textContent).toContain('I ate this');
      expect((ate as HTMLButtonElement).disabled).toBe(false);
      expect(screen.queryByTestId('today-undo-logged')).toBeNull();
    });

    it('Undo un-logs exactly that meal slot and releases the card', () => {
      render(
        <NextMealCard meal={{ ...MEAL, mealType: 'snack', slotIndex: 3 }} isTomorrow={false} />,
      );
      act(() => mocks.onSuccess?.({ rebalance: null }));
      fireEvent.click(screen.getByTestId('today-undo-logged'));
      expect(mocks.undo).toHaveBeenCalledWith(
        expect.objectContaining({ recipeId: 'curry', mealType: 'snack', slotIndex: 3 }),
      );
      act(() => mocks.onUndoSuccess?.());
      expect(screen.getByTestId('today-ate-this').textContent).toContain('I ate this');
      expect(screen.queryByTestId('today-logged-status')).toBeNull();
    });
  });
});

// WP-06: "Ate something else" / "Skipped it" next to "I ate this".
describe('NextMealCard — flexible eating (WP-06)', () => {
  const planned = { ...MEAL, slotIndex: 2 };

  it('has an overflow with both actions that act on this slot', () => {
    const flow = fakeSlotFlow();
    render(<NextMealCard meal={planned} isTomorrow={false} flow={flow} />);
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Dinner' }));
    fireEvent.click(screen.getByText('Ate something else'));
    expect(flow.openAteElse).toHaveBeenCalledWith(
      expect.objectContaining({ mealType: 'dinner', slotIndex: 2 }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'More actions for Dinner' }));
    fireEvent.click(screen.getByText('Skipped it'));
    expect(flow.skip).toHaveBeenCalledWith(
      expect.objectContaining({ mealType: 'dinner', slotIndex: 2 }),
    );
  });

  it('keeps "I ate this" as it was', () => {
    render(<NextMealCard meal={planned} isTomorrow={false} flow={fakeSlotFlow()} />);
    expect(screen.getByTestId('today-ate-this')).toBeTruthy();
  });

  it("has no overflow without a flow, or when it is tomorrow's meal", () => {
    render(<NextMealCard meal={planned} isTomorrow={false} />);
    expect(screen.queryByRole('button', { name: /More actions/ })).toBeNull();
    cleanup();
    render(<NextMealCard meal={planned} isTomorrow flow={fakeSlotFlow()} />);
    expect(screen.queryByRole('button', { name: /More actions/ })).toBeNull();
  });
});
