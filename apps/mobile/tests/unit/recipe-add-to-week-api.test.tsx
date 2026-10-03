import { Platform } from 'react-native';
import { screen, userEvent, waitFor } from '@testing-library/react-native';
import { resetSnackbarForTests } from '@chefer/ui-mobile';
import { localWeekday } from '../../src/features/friends/add-to-week/add-to-week-logic';
import { AddToWeekSheet } from '../../src/features/friends/add-to-week/add-to-week-sheet';
import { renderWithTrpc, type Handlers } from './friends-core-harness';
import { testQueryClient } from './friends-profile-fixtures';

// UX-REC-08: "Add to my week" on any recipe goes through `recipe.addToWeek` /
// `recipe.undoAddToWeek` (no Following needed); the friends procedures stay
// the default for another person's recipe.

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const TODAY = localWeekday();
const RECIPE = { id: 'rcp-own', name: 'My soup', kcal: 300 };
const result = {
  planId: 'plan-1',
  dayOfWeek: TODAY,
  mealType: 'breakfast',
  slotIndex: 1,
  addedRecipeId: 'rcp-own',
  copiedFromId: null,
};

function handlers(extra: Handlers): Handlers {
  return {
    'mealPlan.getForWeek': () => ({
      planId: 'plan-1',
      weekStartDate: new Date(),
      days: [{ dayOfWeek: TODAY, meals: [] }],
    }),
    'mealPlan.getShape': () => ({
      slots: ['breakfast'],
      days: [0, 1, 2, 3, 4, 5, 6],
      timeCapMins: null,
      weekendNoLimit: false,
      cookingFor: null,
    }),
    ...extra,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  resetSnackbarForTests();
  jest.replaceProperty(Platform, 'OS', 'android');
});
afterEach(() => jest.restoreAllMocks());

async function addOne(api: 'friends' | 'recipe', h: Handlers) {
  const r = await renderWithTrpc(
    <AddToWeekSheet recipe={RECIPE} api={api} onDismiss={jest.fn()} />,
    h,
    testQueryClient(),
  );
  const user = userEvent.setup();
  await user.press(await screen.findByTestId('friends-add-to-week-slot-breakfast-add'));
  await user.press(screen.getByTestId('friends-add-to-week-cta'));
  return { r, user };
}

describe('AddToWeekSheet api', () => {
  it('api="recipe" adds and undoes through recipe.*', async () => {
    const add = jest.fn(() => result);
    const undo = jest.fn(() => ({ ok: true }));
    const friendsAdd = jest.fn();
    const { r, user } = await addOne(
      'recipe',
      handlers({
        'recipe.addToWeek': add,
        'recipe.undoAddToWeek': undo,
        'friends.addRecipeToWeek': friendsAdd,
      }),
    );
    await waitFor(() => expect(add).toHaveBeenCalledTimes(1));
    expect(friendsAdd).not.toHaveBeenCalled();
    await user.press(await screen.findByText('Undo'));
    await waitFor(() => expect(undo).toHaveBeenCalledTimes(1));
    expect(r.paths()).not.toContain('friends.undoAddToWeek');
  });

  it('defaults to the friends procedures', async () => {
    const add = jest.fn(() => result);
    const recipeAdd = jest.fn();
    await addOne(
      'friends',
      handlers({ 'friends.addRecipeToWeek': add, 'recipe.addToWeek': recipeAdd }),
    );
    await waitFor(() => expect(add).toHaveBeenCalledTimes(1));
    expect(recipeAdd).not.toHaveBeenCalled();
  });
});
