// @vitest-environment jsdom
import { fakeSlotFlow } from '@/features/tracker/lib/slot-flow.fixture';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { TodaySlotNotes } from './today-slot-notes';

// WP-06: replaced and skipped slots stay visible on Today, with an Undo.

afterEach(cleanup);

describe('TodaySlotNotes', () => {
  it('lists only replaced and skipped slots', () => {
    render(
      <TodaySlotNotes
        flow={fakeSlotFlow()}
        slots={[
          { slotIndex: 0, mealType: 'breakfast', status: 'eaten' },
          { slotIndex: 1, mealType: 'lunch', status: 'planned' },
          {
            slotIndex: 2,
            mealType: 'snack',
            status: 'replaced',
            replacedBy: { entryId: 'r1', name: 'Pizza · big', kcal: 1100, protein: 45 },
          },
          { slotIndex: 3, mealType: 'dinner', status: 'skipped' },
        ]}
      />,
    );
    expect(screen.getByTestId('today-slot-replaced-2').textContent).toContain(
      'Snack · You had: Pizza · big (≈ 1,100 kcal)',
    );
    expect(screen.getByTestId('today-slot-skipped-3').textContent).toContain('Dinner · Skipped');
    expect(screen.queryByTestId('today-slot-eaten-0')).toBeNull();
    expect(screen.queryByText(/Lunch/)).toBeNull();
  });

  it('renders nothing when nothing was replaced or skipped', () => {
    const { container } = render(
      <TodaySlotNotes
        flow={fakeSlotFlow()}
        slots={[{ slotIndex: 0, mealType: 'lunch', status: 'planned' }]}
      />,
    );
    expect(container.textContent).toBe('');
  });

  it('Undo unskips a skipped slot and deletes the replacement of a replaced one', () => {
    const flow = fakeSlotFlow();
    render(
      <TodaySlotNotes
        flow={flow}
        slots={[
          {
            slotIndex: 2,
            mealType: 'snack',
            status: 'replaced',
            replacedBy: { entryId: 'r1', name: 'Pizza', kcal: 900, protein: 40 },
          },
          { slotIndex: 3, mealType: 'dinner', status: 'skipped' },
        ]}
      />,
    );
    fireEvent.click(screen.getByTestId('today-slot-undo-3'));
    expect(flow.unskip).toHaveBeenCalledWith(
      expect.objectContaining({ mealType: 'dinner', slotIndex: 3 }),
    );
    fireEvent.click(screen.getByTestId('today-slot-undo-2'));
    expect(flow.undoReplacement).toHaveBeenCalledWith(
      'r1',
      expect.objectContaining({ mealType: 'snack', slotIndex: 2 }),
    );
  });
});
