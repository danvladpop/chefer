// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextMealCard } from './next-meal-card';

// P2-2: Today logs the planned meal in one tap through tracker.logRecipe.

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  invalidateSummary: vi.fn(),
  onSuccess: undefined as undefined | ((data: { rebalance: null }) => void),
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

  it('shows the real time (prep + cook), not prep alone (F-PM-10)', () => {
    render(<NextMealCard meal={MEAL} isTomorrow={false} />);
    expect(screen.getByText('40 min')).toBeTruthy();
  });

  it("tomorrow's meal can be viewed but not logged", () => {
    render(<NextMealCard meal={MEAL} isTomorrow />);
    expect(screen.queryByTestId('today-ate-this')).toBeNull();
    expect(screen.getByText('Tomorrow')).toBeTruthy();
  });
});
