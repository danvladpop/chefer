// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { DAY_FIT_COPY } from '@chefer/utils';
import type { ReplaceMealResult } from '../components/ReplaceMealSheet';
import {
  useDayFit,
  type DayFitOutcome,
  type DayFitSuggestion,
  type UseDayFitOptions,
} from './use-day-fit';

// Day rebalance on the Meals page: the toast after a swap/replace, its Undo
// (put the recipe back with no new fit, then restore the day's portions), the
// adjusted marker and the one-change suggestion (apply · Undo · stale · Leave it).

const m = vi.hoisted(() => ({
  calls: [] as string[],
  replace: vi.fn<[unknown], Promise<unknown>>(),
  restore: vi.fn<[unknown], Promise<unknown>>(),
  apply: vi.fn<[unknown], Promise<unknown>>(),
  undoAdd: vi.fn<[unknown], Promise<unknown>>(),
}));

vi.mock('@/lib/trpc', () => {
  const mutation = (name: string, fn: Mock<[unknown], Promise<unknown>>) => ({
    useMutation: () => ({
      mutateAsync: (input: unknown) => {
        m.calls.push(name);
        return fn(input);
      },
    }),
  });
  return {
    trpc: {
      mealPlan: {
        replaceRecipe: mutation('replaceRecipe', m.replace),
        restoreDayPortions: mutation('restoreDayPortions', m.restore),
        applyDayFitSuggestion: mutation('applyDayFitSuggestion', m.apply),
      },
      recipe: { undoAddToWeek: mutation('undoAddToWeek', m.undoAdd) },
    },
  };
});

const fit = (over: Partial<DayFitOutcome> = {}): DayFitOutcome => ({
  planId: 'plan-1',
  dayOfWeek: 1,
  changes: [{ slotIndex: 1, mealType: 'lunch', recipeName: 'Couscous', from: 1, to: 1.5 }],
  previousPortions: [1, 1, 1],
  kcal: 2400,
  proteinG: 140,
  targetKcal: 2400,
  targetProteinG: 140,
  onTarget: true,
  nothingOpen: false,
  suggestion: null,
  ...over,
});

const target = { planId: 'plan-1', dayOfWeek: 1, mealType: 'dinner', slotIndex: 2 } as const;
const changed = (over: Partial<ReplaceMealResult> = {}): ReplaceMealResult => ({
  target: { ...target, mealName: 'Old Dinner', recipeId: 'old-dinner' },
  recipeName: 'Tofu Bowl',
  previousRecipeId: 'old-dinner',
  ...over,
});

let showToast: ReturnType<typeof vi.fn>;
let onPlanChanged: ReturnType<typeof vi.fn>;
const setup = (over: Partial<UseDayFitOptions> = {}) =>
  renderHook((props: Partial<UseDayFitOptions>) =>
    useDayFit({
      planId: 'plan-1',
      todayDayOfWeek: 3,
      viewKey: '0:1',
      showToast,
      onPlanChanged,
      ...over,
      ...props,
    }),
  );
/** The action of the latest toast. */
const lastAction = () => {
  const call = showToast.mock.calls.at(-1) as [string, { label: string; onClick: () => void }?];
  return call[1];
};

beforeEach(() => {
  m.calls = [];
  m.replace.mockReset().mockResolvedValue({ id: 'old-dinner' });
  m.restore.mockReset().mockResolvedValue({ restored: true });
  m.apply.mockReset();
  m.undoAdd.mockReset().mockResolvedValue({ ok: true });
  showToast = vi.fn();
  onPlanChanged = vi.fn();
});
afterEach(cleanup);

describe('useDayFit — after a swap/replace', () => {
  it('names what was resized, marks those cards, and Undo puts back recipe then portions', async () => {
    const { result } = setup();
    act(() => result.current.onSlotChanged(changed({ previousPinned: true, dayFit: fit() })));

    expect(showToast).toHaveBeenCalledWith(
      'Lunch is now 1½× so Tuesday stays on target',
      expect.objectContaining({ label: DAY_FIT_COPY.undo }),
    );
    expect([...(result.current.adjustedSlots(1) ?? [])]).toEqual([1]);
    expect(result.current.adjustedSlots(2)).toBeUndefined();

    act(() => lastAction()?.onClick());
    await waitFor(() => expect(m.restore).toHaveBeenCalled());
    expect(m.calls).toEqual(['replaceRecipe', 'restoreDayPortions']);
    expect(m.replace).toHaveBeenCalledWith({
      planId: 'plan-1',
      dayOfWeek: 1,
      mealType: 'dinner',
      slotIndex: 2,
      recipeId: 'old-dinner',
      pinned: true,
      fitDay: false,
    });
    expect(m.restore).toHaveBeenCalledWith({ planId: 'plan-1', dayOfWeek: 1, portions: [1, 1, 1] });
    expect(onPlanChanged).toHaveBeenCalled();
    expect(result.current.adjustedSlots(1)).toBeUndefined();
  });

  it('says "today" when the changed day is today', () => {
    const { result } = setup({ todayDayOfWeek: 1 });
    act(() => result.current.onSlotChanged(changed({ dayFit: fit() })));
    expect(showToast.mock.calls[0]?.[0]).toBe('Lunch is now 1½× so today stays on target');
  });

  it('nothing resized: the usual "Swapped to …" and an Undo with no new fit and no restore', async () => {
    const { result } = setup();
    act(() =>
      result.current.onSlotChanged(changed({ dayFit: fit({ changes: [], nothingOpen: true }) })),
    );
    expect(showToast.mock.calls[0]?.[0]).toBe('Swapped to Tofu Bowl');
    expect(result.current.adjustedSlots(1)).toBeUndefined();
    act(() => lastAction()?.onClick());
    await waitFor(() => expect(m.replace).toHaveBeenCalled());
    expect(m.replace.mock.calls[0]?.[0]).toMatchObject({ pinned: false, fitDay: false });
    expect(m.restore).not.toHaveBeenCalled();
  });

  it('the marker clears when the user moves to another day or week', () => {
    const { result, rerender } = setup();
    act(() => result.current.onSlotChanged(changed({ dayFit: fit() })));
    expect(result.current.adjustedSlots(1)).toBeDefined();
    rerender({ viewKey: '0:2' });
    expect(result.current.adjustedSlots(1)).toBeUndefined();
  });
});

describe('useDayFit — the one-change suggestion', () => {
  const swapSuggestion = {
    kind: 'swap' as const,
    slotIndex: 0,
    mealType: 'breakfast',
    recipeId: 'bowl',
    recipeName: 'Protein Bowl',
    kcalDelta: 390,
    proteinDelta: 31,
  };
  const withSuggestion = (s: DayFitSuggestion = swapSuggestion) =>
    changed({ dayFit: fit({ onTarget: false, kcal: 1980, suggestion: s }) });

  it('is kept for that plan + day only; Leave it hides it', () => {
    const { result, rerender } = setup();
    act(() => result.current.onSlotChanged(withSuggestion()));
    expect(result.current.suggestionFor(1)).toMatchObject({
      kcal: 1980,
      suggestion: swapSuggestion,
    });
    expect(result.current.suggestionFor(2)).toBeNull();
    rerender({ planId: 'plan-2' });
    expect(result.current.suggestionFor(1)).toBeNull();
    rerender({ planId: 'plan-1' });
    act(() => result.current.leaveSuggestion());
    expect(result.current.suggestionFor(1)).toBeNull();
    expect(m.calls).toEqual([]);
  });

  it('a swap applies with localDate; Undo swaps back unpinned with no fit, then restores', async () => {
    m.apply.mockResolvedValue({
      dayFit: fit({ changes: [] }),
      undo: { kind: 'swap', slotIndex: 0, mealType: 'breakfast', previousRecipeId: 'oats' },
      previousPortions: [1, 1.5, 1],
    });
    const { result } = setup();
    act(() => result.current.onSlotChanged(withSuggestion()));
    await act(() => result.current.applySuggestion());

    expect(m.apply).toHaveBeenCalledWith({
      planId: 'plan-1',
      dayOfWeek: 1,
      kind: 'swap',
      mealType: 'breakfast',
      recipeId: 'bowl',
      slotIndex: 0,
      localDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) as unknown,
    });
    expect(result.current.suggestionFor(1)).toBeNull();
    expect(showToast).toHaveBeenLastCalledWith(
      'Breakfast swapped for Protein Bowl',
      expect.objectContaining({ label: DAY_FIT_COPY.undo }),
    );

    m.calls = [];
    act(() => lastAction()?.onClick());
    await waitFor(() => expect(m.restore).toHaveBeenCalled());
    expect(m.calls).toEqual(['replaceRecipe', 'restoreDayPortions']);
    expect(m.replace).toHaveBeenCalledWith({
      planId: 'plan-1',
      dayOfWeek: 1,
      mealType: 'breakfast',
      slotIndex: 0,
      recipeId: 'oats',
      pinned: false,
      fitDay: false,
    });
    expect(m.restore).toHaveBeenCalledWith({
      planId: 'plan-1',
      dayOfWeek: 1,
      portions: [1, 1.5, 1],
    });
  });

  it('a snack applies without a slot; Undo takes the added snack out, then restores', async () => {
    const snack: DayFitSuggestion = {
      kind: 'snack',
      mealType: 'snack',
      recipeId: 'bowl',
      recipeName: 'Protein Bowl',
      kcalDelta: 390,
      proteinDelta: 31,
    };
    m.apply.mockResolvedValue({
      dayFit: null,
      undo: { kind: 'snack', slotIndex: 3 },
      previousPortions: [1, 1, 1],
    });
    const { result } = setup();
    act(() => result.current.onSlotChanged(withSuggestion(snack)));
    await act(() => result.current.applySuggestion());
    expect(m.apply.mock.calls[0]?.[0]).not.toHaveProperty('slotIndex');
    expect(showToast).toHaveBeenLastCalledWith('Added Protein Bowl', expect.anything());

    m.calls = [];
    act(() => lastAction()?.onClick());
    await waitFor(() => expect(m.restore).toHaveBeenCalled());
    expect(m.calls).toEqual(['undoAddToWeek', 'restoreDayPortions']);
    expect(m.undoAdd).toHaveBeenCalledWith({
      planId: 'plan-1',
      dayOfWeek: 1,
      mealType: 'snack',
      slotIndex: 3,
      addedRecipeId: 'bowl',
    });
  });

  it('a stale suggestion (CONFLICT) says so, drops the card and refetches', async () => {
    m.apply.mockRejectedValue({ data: { code: 'CONFLICT' }, message: 'stale' });
    const { result } = setup();
    act(() => result.current.onSlotChanged(withSuggestion()));
    onPlanChanged.mockClear();
    await act(() => result.current.applySuggestion());
    expect(showToast).toHaveBeenLastCalledWith(DAY_FIT_COPY.stale);
    expect(result.current.suggestionFor(1)).toBeNull();
    expect(onPlanChanged).toHaveBeenCalledTimes(1);
  });
});
