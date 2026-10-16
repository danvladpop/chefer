import { act, screen, userEvent, waitFor } from '@testing-library/react-native';
import { DayFitNote, resetDayFitNoteForTests } from '../../src/features/tracker/day-fit-note';
import { recordRebalanceOutcome } from '../../src/features/tracker/rebalance-offer-store';
import { renderWithTrpc } from './friends-core-harness';
import { testQueryClient } from './friends-profile-fixtures';

// Day rebalance (2026-10-16): a log for today resized today's open meals; the
// note says which, next to the week banner, with its own Undo.

afterEach(() => resetDayFitNoteForTests());

const dayFit = {
  planId: 'p1',
  dayOfWeek: 2,
  changes: [{ mealType: 'dinner', to: 1.5 }],
  previousPortions: [1, 1, 1],
};

describe('DayFitNote', () => {
  it('renders nothing until a log resized something', async () => {
    await renderWithTrpc(<DayFitNote />, {}, testQueryClient());
    expect(screen.queryByTestId('dayfit-note')).toBeNull();
    await act(() => {
      recordRebalanceOutcome({ rebalance: null, dayFit: { ...dayFit, changes: [] } });
    });
    expect(screen.queryByTestId('dayfit-note')).toBeNull();
  });

  it('says what was resized, and Undo restores the portions', async () => {
    const user = userEvent.setup();
    const { calls } = await renderWithTrpc(
      <DayFitNote />,
      { 'mealPlan.restoreDayPortions': () => ({ restored: true }) },
      testQueryClient(),
    );
    await act(() => {
      recordRebalanceOutcome({ rebalance: null, dayFit });
    });
    expect(await screen.findByText('Dinner is now 1½× so today stays on target')).toBeOnTheScreen();
    await user.press(screen.getByTestId('dayfit-note-undo'));
    await waitFor(() =>
      expect(calls.find((c) => c.path === 'mealPlan.restoreDayPortions')?.input).toEqual({
        planId: 'p1',
        dayOfWeek: 2,
        portions: [1, 1, 1],
      }),
    );
    await waitFor(() => expect(screen.queryByTestId('dayfit-note')).toBeNull());
  });
});
