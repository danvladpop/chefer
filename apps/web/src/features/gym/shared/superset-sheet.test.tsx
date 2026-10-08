// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SupersetSheet } from './superset-sheet';

afterEach(cleanup);
// The Sheet restores the scroll position on close; jsdom has no scrollTo.
vi.spyOn(window, 'scrollTo').mockImplementation(vi.fn());

const ITEMS = ['Curl', 'Pushdown', 'Lateral Raise', 'Face Pull', 'Shrug'].map((name, i) => ({
  id: `e${i}`,
  name,
}));

describe('SupersetSheet', () => {
  it('groups 2 to 4 picks in list order and locks the rest once full', () => {
    const onGroup = vi.fn();
    render(<SupersetSheet open onClose={vi.fn()} items={ITEMS} onGroup={onGroup} />);
    expect(
      screen.getByText('Pick 2 to 4 exercises to do back to back. You rest after the round.'),
    ).toBeInTheDocument();
    const group = screen.getByRole('button', { name: 'Group as superset' });
    expect(group).toBeDisabled();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Lateral Raise' }));
    expect(group).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Curl' }));
    expect(group).toBeEnabled();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Pushdown' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Face Pull' }));
    expect(screen.getByRole('checkbox', { name: 'Shrug' })).toBeDisabled();
    expect(screen.queryByRole('checkbox', { name: 'Also change my routine' })).toBeNull();

    fireEvent.click(group);
    expect(onGroup).toHaveBeenCalledWith(['e0', 'e1', 'e2', 'e3'], false);
  });

  it('offers "Also change my routine" (off by default) when the picks allow it', () => {
    const onGroup = vi.fn();
    render(
      <SupersetSheet
        open
        onClose={vi.fn()}
        items={ITEMS}
        initialPicked={['e1']}
        routineOption={(picked) => picked.length >= 2 && !picked.includes('e4')}
        onGroup={onGroup}
      />,
    );
    expect(screen.getByRole('checkbox', { name: 'Pushdown' })).toBeChecked();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Curl' }));
    const also = screen.getByRole('checkbox', { name: 'Also change my routine' });
    expect(also).not.toBeChecked();
    fireEvent.click(also);
    fireEvent.click(screen.getByRole('button', { name: 'Group as superset' }));
    expect(onGroup).toHaveBeenCalledWith(['e0', 'e1'], true);
  });
});
