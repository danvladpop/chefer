// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ChangedByLine,
  routineChangedLine,
  setByLine,
  TrainerNoteLine,
} from './RoutineAttribution';

afterEach(cleanup);

describe('attribution badge', () => {
  it('reads "Changed by Ana · 2 Oct"', () => {
    render(<ChangedByLine stamp={{ name: 'Ana', at: '2026-10-02T12:00:00.000Z' }} />);
    expect(screen.getByTestId('changed-by')).toHaveTextContent('Changed by Ana · 2 Oct');
  });

  it('names a trainer who stopped coaching as a former trainer', () => {
    render(<ChangedByLine stamp={{ name: 'Ana', at: '2026-10-02T12:00:00.000Z', former: true }} />);
    expect(screen.getByTestId('changed-by')).toHaveTextContent(
      'Changed by Ana (former trainer) · 2 Oct',
    );
  });

  it('reads "a former trainer" when the account is gone', () => {
    const gone = { name: 'your trainer', at: '2026-10-02T12:00:00.000Z', former: true };
    render(<ChangedByLine stamp={gone} />);
    expect(screen.getByTestId('changed-by')).toHaveTextContent(
      'Changed by a former trainer · 2 Oct',
    );
    expect(routineChangedLine(gone)).toBe('A former trainer changed your routine · 2 Oct');
    expect(setByLine({ name: 'Ana', former: true })).toBe('Set by Ana (former trainer)');
    expect(setByLine({ name: 'Ana' })).toBe('Set by Ana');
  });

  it('shows the trainer note as "Ana: …" and removes it on request', () => {
    const onRemove = vi.fn();
    render(
      <TrainerNoteLine trainerName="Ana" note="knees out, slow eccentric" onRemove={onRemove} />,
    );
    expect(screen.getByTestId('trainer-note')).toHaveTextContent('Ana: knees out, slow eccentric');
    fireEvent.click(screen.getByRole('button', { name: 'Remove note' }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('has no remove button when the note cannot be removed (the logger)', () => {
    render(<TrainerNoteLine trainerName="Ana" note="tempo 3-1-1" />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
