import { SafeAreaProvider } from 'react-native-safe-area-context';
import { render, screen, userEvent } from '@testing-library/react-native';
import type { CustomEntryRow } from '@chefer/utils';
import { EditEntrySheet } from '../../src/features/tracker/edit-entry-sheet';

// Edit any custom entry, undo any delete (bug B-34, T-19.2).

const mockUpdate = jest.fn();
const mockDelete = jest.fn();
const mockRestore = jest.fn();
const mockInvalidate = jest.fn();
const mockSnackbarShow = jest.fn();

const mockUpdateState: { isPending: boolean; isError: boolean; error: { message: string } | null } =
  { isPending: false, isError: false, error: null };

jest.mock('@chefer/ui-mobile', () => {
  const actual = jest.requireActual<typeof import('@chefer/ui-mobile')>('@chefer/ui-mobile');
  return { ...actual, useSnackbar: () => ({ show: mockSnackbarShow }) };
});

jest.mock('../../src/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      tracker: {
        getDay: { invalidate: mockInvalidate },
        weeklySummary: { invalidate: mockInvalidate },
        monthlySummary: { invalidate: mockInvalidate },
      },
      dashboard: { summary: { invalidate: mockInvalidate } },
    }),
    tracker: {
      updateCustomMeal: {
        useMutation: (opts: { onSuccess?: () => void }) => ({
          ...mockUpdateState,
          mutate: (vars: unknown) => {
            mockUpdate(vars);
            if (!mockUpdateState.isError) opts.onSuccess?.();
          },
        }),
      },
      deleteCustomMeal: {
        useMutation: () => ({
          mutate: (vars: unknown, callbacks?: { onSuccess?: () => void }) => {
            mockDelete(vars);
            callbacks?.onSuccess?.();
          },
          isPending: false,
        }),
      },
      restoreCustomMeal: {
        useMutation: (opts: { onSuccess?: () => void }) => ({
          mutate: (vars: unknown) => {
            mockRestore(vars);
            opts.onSuccess?.();
          },
          isPending: false,
        }),
      },
    },
  },
}));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

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

const onClose = jest.fn();
const onSaved = jest.fn();
const onDeleted = jest.fn();

async function renderSheet(overrides: Partial<CustomEntryRow> = {}) {
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <EditEntrySheet
        visible
        onClose={onClose}
        date="2026-09-26"
        entry={{ ...entry, ...overrides }}
        onSaved={onSaved}
        onDeleted={onDeleted}
      />
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdateState.isPending = false;
  mockUpdateState.isError = false;
  mockUpdateState.error = null;
});

describe('EditEntrySheet (bug B-34, T-19.2)', () => {
  it('pre-fills from the entry', async () => {
    await renderSheet();
    expect(screen.getByTestId('edit-entry-name')).toHaveProp('value', 'Protein shake');
    expect(screen.getByTestId('edit-entry-kcal')).toHaveProp('value', '180');
    expect(screen.getByTestId('edit-entry-protein')).toHaveProp('value', '30');
  });

  it('saves the edited fields through updateCustomMeal by entryId', async () => {
    const user = userEvent.setup();
    await renderSheet();
    await user.clear(screen.getByTestId('edit-entry-kcal'));
    await user.type(screen.getByTestId('edit-entry-kcal'), '200');
    await user.press(screen.getByTestId('edit-entry-save'));
    expect(mockUpdate).toHaveBeenCalledWith({
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

  it('on save success shows "Changes saved" and closes', async () => {
    const user = userEvent.setup();
    await renderSheet();
    await user.press(screen.getByTestId('edit-entry-save'));
    expect(mockSnackbarShow).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Changes saved' }),
    );
    expect(onSaved).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  // Bug B-39, T-19.5: the sanity check also gates the edit sheet.
  it('bug B-39: mismatched macros show the sanity line and block Save', async () => {
    const user = userEvent.setup();
    await renderSheet({ kcal: 100, protein: 500, carbs: 0, fat: 0 });
    expect(
      screen.getByText("These don't add up: 100 kcal logged, but the macros add up to 2,000 kcal."),
    ).toBeOnTheScreen();
    await user.press(screen.getByTestId('edit-entry-save'));
    expect(mockUpdate).not.toHaveBeenCalled();
    await user.press(screen.getByTestId('edit-entry-sanity-log-anyway'));
    await user.press(screen.getByTestId('edit-entry-save'));
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ kcal: 100, protein: 500 }));
  });

  it('bug B-34/AC2: deleting shows Undo, which restores the entry exactly', async () => {
    const user = userEvent.setup();
    await renderSheet();
    await user.press(screen.getByTestId('edit-entry-delete'));
    expect(onClose).toHaveBeenCalled();
    expect(mockDelete).toHaveBeenCalledWith({ date: '2026-09-26', entryIndex: 2 });
    expect(onDeleted).toHaveBeenCalled();
    expect(mockSnackbarShow).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Deleted Protein shake', actionLabel: 'Undo' }),
    );
    const [{ onAction }] = mockSnackbarShow.mock.calls[0] as [{ onAction: () => void }];
    onAction();
    expect(mockRestore).toHaveBeenCalledWith({
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

  it('shows the API error', async () => {
    mockUpdateState.isError = true;
    mockUpdateState.error = { message: 'Custom entry not found.' };
    const user = userEvent.setup();
    await renderSheet();
    await user.press(screen.getByTestId('edit-entry-save'));
    expect(screen.getByTestId('edit-entry-api-error')).toHaveTextContent('Custom entry not found.');
  });
});
