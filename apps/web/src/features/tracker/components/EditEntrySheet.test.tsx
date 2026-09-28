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
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
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
        useMutation: () => ({
          mutate: (vars: unknown) => {
            m.restore(vars);
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
    expect(showToast).toHaveBeenCalledWith(
      'Deleted Protein shake',
      expect.objectContaining({ label: 'Undo' }),
    );
    const [, action] = showToast.mock.calls[0] as [string, { onClick: () => void }];
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
  });

  it('shows the API error', () => {
    m.updateState.isError = true;
    m.updateState.error = { message: 'Custom entry not found.' };
    renderSheet();
    fireEvent.click(screen.getByTestId('edit-entry-save'));
    expect(screen.getByTestId('edit-entry-api-error').textContent).toBe('Custom entry not found.');
  });
});
