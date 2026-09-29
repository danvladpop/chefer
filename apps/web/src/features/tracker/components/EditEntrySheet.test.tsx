// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CustomEntryRow } from '@chefer/utils';
import { EditEntrySheet } from './EditEntrySheet';

// Edit any custom entry, undo any delete (bug B-34, T-19.2).

const m = vi.hoisted(() => ({
  update: vi.fn(),
  delete: vi.fn(),
  restore: vi.fn(),
  updateState: { isPending: false, isError: false, error: null as { message: string } | null },
  invalidate: {
    getDay: vi.fn(),
    weeklySummary: vi.fn(),
    monthlySummary: vi.fn(),
    recents: vi.fn(),
    dashboardSummary: vi.fn(),
  },
  setData: vi.fn(),
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      tracker: {
        getDay: { invalidate: m.invalidate.getDay, setData: m.setData },
        weeklySummary: { invalidate: m.invalidate.weeklySummary },
        monthlySummary: { invalidate: m.invalidate.monthlySummary },
        recents: { invalidate: m.invalidate.recents },
      },
      dashboard: { summary: { invalidate: m.invalidate.dashboardSummary } },
    }),
    tracker: {
      updateCustomMeal: {
        useMutation: (opts: { onSuccess?: () => void }) => ({
          ...m.updateState,
          mutate: (vars: unknown) => {
            m.update(vars);
            if (!m.updateState.isError) opts.onSuccess?.();
          },
        }),
      },
      deleteCustomMeal: {
        useMutation: () => ({
          mutate: (vars: unknown, callbacks?: { onSuccess?: () => void }) => {
            m.delete(vars);
            callbacks?.onSuccess?.();
          },
          isPending: false,
        }),
      },
      restoreCustomMeal: {
        useMutation: (opts: { onSuccess?: () => void }) => ({
          mutate: (vars: unknown) => {
            m.restore(vars);
            opts.onSuccess?.();
          },
          isPending: false,
        }),
      },
    },
  },
}));

const entry: CustomEntryRow = {
  entryIndex: 2,
  entryId: 'e1',
  name: 'Protein shake',
  estimatedBy: 'manual',
  mealType: 'snack',
  kcal: 180,
  protein: 30,
  carbs: 5,
  fat: 2,
};

const onClose = vi.fn();
const onSaved = vi.fn();
const onDeleted = vi.fn();
const showToast = vi.fn();

function renderSheet(overrides: Partial<CustomEntryRow> = {}) {
  render(
    <EditEntrySheet
      open
      onClose={onClose}
      date="2026-09-26"
      entry={{ ...entry, ...overrides }}
      onSaved={onSaved}
      onDeleted={onDeleted}
      showToast={showToast}
    />,
  );
}

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  m.updateState.isPending = false;
  m.updateState.isError = false;
  m.updateState.error = null;
});

describe('EditEntrySheet (bug B-34, T-19.2)', () => {
  it('pre-fills from the entry', () => {
    renderSheet();
    expect(screen.getByTestId('edit-entry-name')).toHaveProperty('value', 'Protein shake');
    expect(screen.getByTestId('edit-entry-kcal')).toHaveProperty('value', '180');
  });

  it('saves the edited fields through updateCustomMeal by entryId', () => {
    renderSheet();
    fireEvent.change(screen.getByTestId('edit-entry-kcal'), { target: { value: '200' } });
    fireEvent.click(screen.getByTestId('edit-entry-save'));
    expect(m.update).toHaveBeenCalledWith({
      date: '2026-09-26',
      entryId: 'e1',
      name: 'Protein shake',
      estimatedBy: 'manual',
      mealType: 'snack',
      kcal: 200,
      protein: 30,
      carbs: 5,
      fat: 2,
    });
  });

  it('on save success shows "Changes saved" and closes', () => {
    renderSheet();
    fireEvent.click(screen.getByTestId('edit-entry-save'));
    expect(showToast).toHaveBeenCalledWith('Changes saved');
    expect(onSaved).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  // Bug B-39, T-19.5: the sanity check also gates the edit sheet.
  it('bug B-39: mismatched macros show the sanity line and block Save', () => {
    renderSheet({ kcal: 100, protein: 500, carbs: 0, fat: 0 });
    expect(screen.getByTestId('edit-entry-sanity').textContent).toContain(
      "These don't add up: 100 kcal logged, but the macros add up to 2,000 kcal.",
    );
    fireEvent.click(screen.getByTestId('edit-entry-save'));
    expect(m.update).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('edit-entry-sanity-log-anyway'));
    fireEvent.click(screen.getByTestId('edit-entry-save'));
    expect(m.update).toHaveBeenCalledWith(expect.objectContaining({ kcal: 100, protein: 500 }));
  });

  it('bug B-34/AC2: deleting shows Undo, which restores the entry exactly', () => {
    renderSheet();
    fireEvent.click(screen.getByTestId('edit-entry-delete'));
    expect(onClose).toHaveBeenCalled();
    expect(m.delete).toHaveBeenCalledWith({ date: '2026-09-26', entryIndex: 2 });
    expect(onDeleted).toHaveBeenCalled();
    // The row must be gone as soon as the delete settles — page.tsx's
    // onDeleted only clears local edit-sheet state, so the sheet itself must
    // invalidate the day (the bug: it previously didn't, leaving the deleted
    // row visible until an unrelated refetch).
    expect(m.invalidate.getDay).toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(
      'Deleted Protein shake',
      expect.objectContaining({ label: 'Undo' }),
    );
    const [, action] = showToast.mock.calls[0] as [string, { onClick: () => void }];
    m.invalidate.getDay.mockClear();
    action.onClick();
    expect(m.restore).toHaveBeenCalledWith({
      date: '2026-09-26',
      entry: {
        entryId: 'e1',
        custom: { name: 'Protein shake', estimatedBy: 'manual' },
        mealType: 'snack',
        portionMultiplier: 1,
        kcal: 180,
        protein: 30,
        carbs: 5,
        fat: 2,
      },
    });
    // Undo must also invalidate — the restored row has to reappear on its
    // own, not wait for the next unrelated refetch.
    expect(m.invalidate.getDay).toHaveBeenCalled();
  });

  // AC2 "Delete — immediate": under load, the delete's own invalidate+refetch
  // can take several seconds — too long to make the user wait before the row
  // disappears, and it used to eat into the Undo toast's own window. The row
  // must vanish (and Undo must restore it) from the cache directly, not only
  // once the network round trip lands.
  it('bug B-34/AC2: delete and Undo splice the cache optimistically, not just via a later refetch', () => {
    renderSheet();
    fireEvent.click(screen.getByTestId('edit-entry-delete'));

    const deleteCall = m.setData.mock.calls[0] as [
      { date: string },
      (old: { log: { loggedMeals: unknown[] } }) => { log: { loggedMeals: unknown[] } },
    ];
    expect(deleteCall[0]).toEqual({ date: '2026-09-26' });
    const dayBefore = {
      log: { loggedMeals: ['a', 'b', 'PROTEIN_SHAKE', 'c'] }, // entryIndex 2
    };
    expect(deleteCall[1](dayBefore).log.loggedMeals).toEqual(['a', 'b', 'c']);

    const [, action] = showToast.mock.calls[0] as [string, { onClick: () => void }];
    m.setData.mockClear();
    action.onClick();

    const restoreCall = m.setData.mock.calls[0] as [
      { date: string },
      (old: { log: { loggedMeals: unknown[] } }) => { log: { loggedMeals: unknown[] } },
    ];
    const dayAfterDelete = { log: { loggedMeals: ['a', 'b', 'c'] } };
    expect(restoreCall[1](dayAfterDelete).log.loggedMeals).toEqual([
      'a',
      'b',
      {
        entryId: 'e1',
        custom: { name: 'Protein shake', estimatedBy: 'manual' },
        mealType: 'snack',
        portionMultiplier: 1,
        kcal: 180,
        protein: 30,
        carbs: 5,
        fat: 2,
      },
      'c',
    ]);
  });

  it('shows the API error', () => {
    m.updateState.isError = true;
    m.updateState.error = { message: 'Custom entry not found.' };
    renderSheet();
    fireEvent.click(screen.getByTestId('edit-entry-save'));
    expect(screen.getByTestId('edit-entry-api-error').textContent).toBe('Custom entry not found.');
  });
});
