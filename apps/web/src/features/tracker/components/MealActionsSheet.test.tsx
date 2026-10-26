// @vitest-environment jsdom
import { capture } from '@/lib/analytics';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MealActionsSheet } from './MealActionsSheet';

// Lane A2: save one meal of the day, or copy it with an Undo of exactly the copies.

const m = vi.hoisted(() => ({
  create: vi.fn<[vars: unknown], undefined>(),
  copy: vi.fn<[vars: unknown], undefined>(),
  undo: vi.fn<[vars: unknown], undefined>(),
}));

vi.mock('@/lib/analytics', () => ({ capture: vi.fn() }));
vi.mock('../lib/rebalance-storage', () => ({
  handleRebalanceOutcome: vi.fn(),
  REBALANCE_PREVIEW: { rebalanceMode: 'preview' },
  withDayFitLine: (message: string) => message,
}));
vi.mock('../lib/invalidate', () => ({ invalidateDayQueries: vi.fn() }));
vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({ savedMeals: { list: { invalidate: vi.fn() } } }),
    savedMeals: {
      list: { useQuery: () => ({ data: [] }) },
      createFromDay: {
        useMutation: () => ({
          isPending: false,
          error: null,
          reset: vi.fn(),
          mutate: (vars: { name: string }, cb?: { onSuccess?: (d: unknown) => void }) => {
            m.create(vars);
            cb?.onSuccess?.({ id: 's1', name: vars.name, items: [{}, {}] });
          },
        }),
      },
      delete: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
    tracker: {
      copyMeal: {
        useMutation: () => ({
          isPending: false,
          isError: false,
          mutate: (vars: unknown, cb?: { onSuccess?: (d: unknown) => void }) => {
            m.copy(vars);
            cb?.onSuccess?.({ log: {}, copiedEntryIds: ['c1'], rebalance: null });
          },
        }),
      },
      deleteEntries: { useMutation: () => ({ mutate: (v: unknown) => m.undo(v) }) },
    },
  },
}));

const onToast = vi.fn();
const onClose = vi.fn();

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
});

function renderSheet(loggedMealTypes: string[]) {
  render(
    <MealActionsSheet
      open
      onClose={onClose}
      date="2026-10-22"
      loggedMealTypes={loggedMealTypes}
      onToast={onToast}
    />,
  );
}

describe('MealActionsSheet (lane A2)', () => {
  it('saves the first meal with entries under a name', () => {
    renderSheet(['dinner', 'dinner']);
    expect(screen.getByTestId('meal-actions-count').textContent).toBe('2 entries logged');
    fireEvent.change(screen.getByTestId('meal-actions-name'), { target: { value: 'Date night' } });
    fireEvent.click(screen.getByTestId('meal-actions-save'));
    expect(m.create).toHaveBeenCalledWith({
      name: 'Date night',
      date: '2026-10-22',
      mealType: 'dinner',
    });
    expect(capture).toHaveBeenCalledWith('saved_meal_created', { itemCount: 2 });
  });

  it('a blank name is explained, not sent', () => {
    renderSheet(['dinner']);
    fireEvent.click(screen.getByTestId('meal-actions-save'));
    expect(m.create).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toMatch(/name/);
  });

  it('copies to another meal with an Undo of exactly the copies', () => {
    renderSheet(['lunch']);
    fireEvent.click(screen.getByTestId('meal-actions-to-meal-snack'));
    fireEvent.click(screen.getByTestId('meal-actions-copy'));
    expect(m.copy).toHaveBeenCalledWith(
      expect.objectContaining({
        fromDate: '2026-10-22',
        fromMealType: 'lunch',
        toMealType: 'snack',
      }),
    );
    const [message, action] = onToast.mock.calls[0] as [string, { onClick: () => void }];
    expect(message).toMatch(/^Copied 1 entry to snack/);
    action.onClick();
    expect(m.undo).toHaveBeenCalledWith(expect.objectContaining({ entryIds: ['c1'] }));
  });

  it('nothing logged for the meal: both actions disabled', () => {
    renderSheet([]);
    expect(screen.getByTestId('meal-actions-save')).toHaveProperty('disabled', true);
    expect(screen.getByTestId('meal-actions-copy')).toHaveProperty('disabled', true);
  });
});
