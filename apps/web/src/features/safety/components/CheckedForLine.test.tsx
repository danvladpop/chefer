// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CheckedForLine } from './CheckedForLine';

afterEach(cleanup);

describe('CheckedForLine (UX-02 T-02.2/T-02.3)', () => {
  it('renders the full checked line for every passed rule', () => {
    render(
      <CheckedForLine
        checks={{
          checked: [
            { label: 'Tree nuts', who: 'Luca' },
            { label: 'Vegetarian', who: 'you' },
          ],
          unchecked: [],
        }}
      />,
    );
    expect(screen.getByText('Checked for Tree nuts (Luca) · Vegetarian (you)')).toBeTruthy();
  });

  it('renders a kept-note line under the main line', () => {
    render(
      <CheckedForLine
        checks={{ checked: [{ label: 'Vegan', who: 'you' }], unchecked: ['low sugar'] }}
      />,
    );
    expect(screen.getByText('Can’t check: “low sugar”')).toBeTruthy();
  });

  it('renders nothing when the table has no rules and nothing to report (AC1)', () => {
    const { container } = render(<CheckedForLine checks={{ checked: [], unchecked: [] }} />);
    expect(container.firstChild).toBeNull();
  });

  it('opens the sheet on click when onOpenSheet is given', () => {
    const onOpenSheet = vi.fn();
    render(
      <CheckedForLine
        checks={{ checked: [{ label: 'Fish', who: 'Ana' }], unchecked: [] }}
        onOpenSheet={onOpenSheet}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Opens details\.$/ }));
    expect(onOpenSheet).toHaveBeenCalledTimes(1);
  });
});
