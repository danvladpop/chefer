import { Platform } from 'react-native';
import { screen, userEvent, waitFor } from '@testing-library/react-native';
import { resetSnackbarForTests } from '@chefer/ui-mobile';
import {
  canPickNextWeek,
  defaultDay,
  isPastDay,
  localWeekday,
  readAddFailure,
  slotRows,
} from '../../src/features/friends/add-to-week/add-to-week-logic';
import { AddToWeekSheet } from '../../src/features/friends/add-to-week/add-to-week-sheet';
import { weekdayShort } from '../../src/features/friends/profile/format';
import { renderWithTrpc, trpcError, type Handlers } from './friends-core-harness';
import { testQueryClient } from './friends-profile-fixtures';

// Add to my week (UX §9.5, PRD FR-17.4–17.7): an empty slot adds directly, a
// filled slot chains `Replace {meal}?` after the sheet has exited, a clash
// with the viewer's table shows the conflict line + `Use anyway`, no plan
// offers `Make a plan`, and success shows `Added to {Tue} {lunch}` + Undo.

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
const { router } = jest.requireMock<{ router: { push: jest.Mock } }>('expo-router');

const RECIPE = { id: 'rcp-dal', name: 'Lentil dal', kcal: 480 };
const TODAY = localWeekday();
const DAY = weekdayShort(TODAY);

function plan() {
  return {
    planId: 'plan-1',
    weekStartDate: new Date(),
    days: [
      {
        dayOfWeek: TODAY,
        meals: [
          { type: 'lunch', recipe: { id: 'rcp-wrap', name: 'Chicken wrap' } },
          { type: 'dinner', recipe: { id: 'rcp-salmon', name: 'Salmon & rice' } },
        ],
      },
    ],
  };
}

const SHAPE = {
  slots: ['breakfast', 'lunch', 'dinner'],
  days: [0, 1, 2, 3, 4, 5, 6],
  timeCapMins: null,
  weekendNoLimit: false,
  cookingFor: null,
};

function baseHandlers(extra: Handlers = {}): Handlers {
  return {
    'mealPlan.getForWeek': () => plan(),
    'mealPlan.getShape': () => SHAPE,
    ...extra,
  };
}

async function renderSheet(h: Handlers) {
  const onDismiss = jest.fn();
  const r = await renderWithTrpc(
    <AddToWeekSheet recipe={RECIPE} onDismiss={onDismiss} />,
    h,
    testQueryClient(),
  );
  return { r, onDismiss };
}

const addResult = (more: Record<string, unknown> = {}) => ({
  planId: 'plan-1',
  dayOfWeek: TODAY,
  mealType: 'breakfast',
  slotIndex: 2,
  addedRecipeId: 'rcp-dal-copy',
  copiedFromId: 'rcp-dal',
  ...more,
});

beforeEach(() => {
  jest.clearAllMocks();
  resetSnackbarForTests();
  // Android path of the kit Sheet: onExited fires when the Modal unmounts.
  jest.replaceProperty(Platform, 'OS', 'android');
});
afterEach(() => jest.restoreAllMocks());

describe('add-to-week rules (pure)', () => {
  // 2026-10-01 is a Thursday; 2026-09-30 a Wednesday.
  const thu = new Date(2026, 9, 1, 12);
  const wed = new Date(2026, 8, 30, 12);

  it('offers next week only from Thursday on', () => {
    expect(canPickNextWeek(wed)).toBe(false);
    expect(canPickNextWeek(thu)).toBe(true);
    expect(canPickNextWeek(new Date(2026, 9, 4, 12))).toBe(true); // Sunday
  });

  it('disables past days of this week only', () => {
    expect(isPastDay(0, 2, thu)).toBe(true);
    expect(isPastDay(0, 3, thu)).toBe(false);
    expect(isPastDay(1, 0, thu)).toBe(false);
    expect(defaultDay(0, thu)).toBe(3);
    expect(defaultDay(1, thu)).toBe(0);
  });

  it('builds Add here / Replace rows in meal order, one per filled meal, then an "Add as a side" row (FB7-04)', () => {
    const rows = slotRows(
      {
        days: [
          {
            dayOfWeek: 1,
            meals: [
              { type: 'snack', recipe: { name: 'Apple' } },
              { type: 'lunch', recipe: { name: 'Wrap' } },
              { type: 'snack', recipe: { name: 'Nuts' } },
            ],
          },
        ],
      },
      1,
      ['breakfast', 'lunch'],
    );
    expect(
      rows.map((r) => [r.mealType, r.mode, r.slotIndex, r.currentName, r.side ?? false]),
    ).toEqual([
      ['breakfast', 'add', null, null, false],
      ['lunch', 'replace', 1, 'Wrap', false],
      ['lunch', 'add', null, null, true],
      ['snack', 'replace', 0, 'Apple', false],
      ['snack', 'replace', 2, 'Nuts', false],
      ['snack', 'add', null, null, true],
    ]);
  });

  it('reads the server’s failures', () => {
    expect(
      readAddFailure(
        trpcError(
          'FORBIDDEN',
          403,
          { unsafeForTable: { issues: ['peanuts'] } },
          'UNSAFE_FOR_TABLE: this recipe contains peanuts, which conflicts.',
        ),
      ),
    ).toEqual({
      kind: 'conflict',
      message: 'this recipe contains peanuts, which conflicts.',
      canAcknowledge: true,
    });
    expect(
      readAddFailure(trpcError('FORBIDDEN', 403, {}, 'UNSAFE_FOR_TABLE: contains milk.')),
    ).toMatchObject({ kind: 'conflict', canAcknowledge: false });
    expect(
      readAddFailure(trpcError('NOT_FOUND', 404, {}, 'You don’t have a plan for this week yet.')),
    ).toEqual({ kind: 'noPlan' });
    expect(readAddFailure(trpcError('INTERNAL_SERVER_ERROR', 500))).toEqual({ kind: 'error' });
  });
});

describe('AddToWeekSheet', () => {
  it('shows the recipe, the slots of today, and a CTA disabled until a slot is picked', async () => {
    await renderSheet(baseHandlers());
    // The title, and the CTA's label until a slot is picked.
    expect(await screen.findAllByText('Add to your week')).toHaveLength(2);
    expect(screen.getByText('Lentil dal · 480 kcal')).toBeTruthy();
    expect(await screen.findByText('Chicken wrap')).toBeTruthy();
    expect(screen.getByText('Add here')).toBeTruthy();
    // FB7-04: a replace row per filled meal, and a side row for each type that has a dish.
    expect(screen.getAllByText('Replace this meal')).toHaveLength(2);
    expect(screen.getAllByText('Add as a side')).toHaveLength(2);
    expect(screen.getByTestId('friends-add-to-week-cta')).toBeDisabled();
  });

  it('an empty slot adds directly, then `Added to …` with Undo (passing the result back)', async () => {
    const add = jest.fn(() => addResult({ previousPinned: false }));
    const undo = jest.fn(() => ({ ok: true }));
    const { onDismiss } = await renderSheet(
      baseHandlers({ 'friends.addRecipeToWeek': add, 'friends.undoAddToWeek': undo }),
    );
    const user = userEvent.setup();
    await user.press(await screen.findByTestId('friends-add-to-week-slot-breakfast-add'));
    expect(screen.getByText(`Add to ${DAY} breakfast`)).toBeTruthy();
    await user.press(screen.getByTestId('friends-add-to-week-cta'));
    await waitFor(() =>
      expect(add).toHaveBeenCalledWith({
        recipeId: 'rcp-dal',
        weekOffset: 0,
        dayOfWeek: TODAY,
        mealType: 'breakfast',
        mode: 'add',
      }),
    );
    await waitFor(() => expect(onDismiss).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(`Added to ${DAY} breakfast`)).toBeTruthy();
    await user.press(screen.getByText('Undo'));
    await waitFor(() =>
      expect(undo).toHaveBeenCalledWith({
        planId: 'plan-1',
        dayOfWeek: TODAY,
        mealType: 'breakfast',
        slotIndex: 2,
        addedRecipeId: 'rcp-dal-copy',
        previousPinned: false,
      }),
    );
  });

  it('FB7-04: "Add as a side" puts the recipe next to the lunch — add mode, no confirm', async () => {
    const add = jest.fn(() => addResult({ mealType: 'lunch', slotIndex: 2 }));
    await renderSheet(baseHandlers({ 'friends.addRecipeToWeek': add }));
    const user = userEvent.setup();
    await user.press(await screen.findByTestId('friends-add-to-week-slot-lunch-side'));
    await user.press(screen.getByTestId('friends-add-to-week-cta'));
    await waitFor(() =>
      expect(add).toHaveBeenCalledWith({
        recipeId: 'rcp-dal',
        weekOffset: 0,
        dayOfWeek: TODAY,
        mealType: 'lunch',
        mode: 'add',
      }),
    );
    expect(screen.queryByText('Replace lunch?')).toBeNull();
  });

  it('a filled slot closes the sheet, then asks `Replace {meal}?`, then replaces', async () => {
    const add = jest.fn(() =>
      addResult({ mealType: 'lunch', slotIndex: 0, previousRecipeId: 'rcp-wrap' }),
    );
    const { onDismiss } = await renderSheet(baseHandlers({ 'friends.addRecipeToWeek': add }));
    const user = userEvent.setup();
    await user.press(await screen.findByTestId('friends-add-to-week-slot-lunch-0'));
    await user.press(screen.getByTestId('friends-add-to-week-cta'));
    expect(await screen.findByText('Replace Chicken wrap?')).toBeTruthy();
    expect(screen.getByText(`Lentil dal goes on ${DAY} lunch instead.`)).toBeTruthy();
    // The picker is gone before the confirm is up (iOS: never two at once).
    expect(screen.queryByText('Add to your week')).toBeNull();
    expect(add).not.toHaveBeenCalled();
    await user.press(screen.getByTestId('friends-add-to-week-replace-confirm'));
    await waitFor(() =>
      expect(add).toHaveBeenCalledWith({
        recipeId: 'rcp-dal',
        weekOffset: 0,
        dayOfWeek: TODAY,
        mealType: 'lunch',
        mode: 'replace',
        slotIndex: 0,
      }),
    );
    await waitFor(() => expect(onDismiss).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(`Added to ${DAY} lunch`)).toBeTruthy();
  });

  it('cancelling the replace goes back to the picker', async () => {
    await renderSheet(baseHandlers());
    const user = userEvent.setup();
    await user.press(await screen.findByTestId('friends-add-to-week-slot-lunch-0'));
    await user.press(screen.getByTestId('friends-add-to-week-cta'));
    await user.press(await screen.findByTestId('friends-add-to-week-replace-cancel'));
    expect(await screen.findByText('Add to your week')).toBeTruthy();
  });

  it('a conflict keeps the sheet open with the line and `Use anyway`, which acknowledges it', async () => {
    let calls = 0;
    const add = jest.fn(() => {
      calls += 1;
      if (calls === 1) {
        throw trpcError(
          'FORBIDDEN',
          403,
          { unsafeForTable: { issues: ['peanuts'] } },
          'UNSAFE_FOR_TABLE: this recipe contains peanuts, which conflicts with an allergy or dietary restriction set for your table.',
        );
      }
      return addResult();
    });
    const { onDismiss } = await renderSheet(baseHandlers({ 'friends.addRecipeToWeek': add }));
    const user = userEvent.setup();
    await user.press(await screen.findByTestId('friends-add-to-week-slot-breakfast-add'));
    await user.press(screen.getByTestId('friends-add-to-week-cta'));
    expect(await screen.findByTestId('friends-add-to-week-conflict')).toBeTruthy();
    expect(screen.getByText(/this recipe contains peanuts/)).toBeTruthy();
    expect(screen.getByText('Add to your week')).toBeTruthy();
    expect(onDismiss).not.toHaveBeenCalled();
    await user.press(screen.getByText('Use anyway'));
    await waitFor(() =>
      expect(add).toHaveBeenLastCalledWith(expect.objectContaining({ acknowledgeConflict: true })),
    );
    await waitFor(() => expect(onDismiss).toHaveBeenCalledTimes(1));
  });

  it('no plan → `Make a plan` closes the sheet, then opens the Plan tab', async () => {
    const { onDismiss } = await renderSheet(baseHandlers({ 'mealPlan.getForWeek': () => null }));
    expect(await screen.findByText('You don’t have a plan for this week yet.')).toBeTruthy();
    await userEvent.setup().press(screen.getByText('Make a plan'));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/meal-plan'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
