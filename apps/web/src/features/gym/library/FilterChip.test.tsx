// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExerciseDto } from '@chefer/types';
import { ExercisePickerSheet } from '../routine/components/ExercisePickerSheet';
import { FilterChip } from './FilterChip';

vi.mock('@/features/gym/use-gym-bootstrap', () => ({ exerciseImageUrl: () => null }));

afterEach(cleanup);

// The Sheet's scroll lock restores the scroll position on close; jsdom has no scrollTo.
vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);

function Harness() {
  const [on, setOn] = useState(false);
  return (
    <FilterChip active={on} onClick={() => setOn((v) => !v)}>
      Chest
    </FilterChip>
  );
}

describe('FilterChip', () => {
  it('exposes its selected state through aria-pressed, not colour alone', () => {
    render(<Harness />);
    const chip = screen.getByRole('button', { name: 'Chest' });
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'true');
  });

  it('meets the 44px touch-target minimum', () => {
    render(<Harness />);
    expect(screen.getByRole('button', { name: 'Chest' })).toHaveClass('min-h-11');
  });
});

describe('Routine ExercisePickerSheet filters', () => {
  it('labels the search box and marks the active muscle-group chip as pressed', () => {
    render(
      <ExercisePickerSheet open onClose={vi.fn()} library={[] as ExerciseDto[]} onPick={vi.fn()} />,
    );

    expect(screen.getByRole('searchbox', { name: 'Search exercises' })).toBeInTheDocument();

    const group = screen.getByRole('group', { name: 'Muscle group' });
    const chips = Array.from(group.querySelectorAll('button'));
    const all = chips[0];
    const second = chips[1];
    if (!all || !second) throw new Error('expected at least two filter chips');

    expect(all).toHaveAttribute('aria-pressed', 'true');
    expect(second).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(second);
    expect(all).toHaveAttribute('aria-pressed', 'false');
    expect(second).toHaveAttribute('aria-pressed', 'true');
  });
});
