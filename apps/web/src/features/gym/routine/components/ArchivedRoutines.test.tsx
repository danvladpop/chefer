// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RoutineListItemDto } from '@chefer/types';
import { ArchivedRoutines } from './ArchivedRoutines';

afterEach(cleanup);

const ARCHIVED: RoutineListItemDto = {
  id: 'r3',
  name: 'Old Split',
  templateKey: null,
  isActive: false,
  dayCount: 4,
  archived: true,
  updatedAt: '2026-09-20T00:00:00.000Z',
};

function renderSection(rows: RoutineListItemDto[], onRestore = vi.fn()) {
  render(
    <ArchivedRoutines rows={rows} restoringId={null} disabled={false} onRestore={onRestore} />,
  );
  return onRestore;
}

describe('ArchivedRoutines (UX-GYM-34)', () => {
  it('renders nothing when no routine is archived', () => {
    renderSection([]);
    expect(screen.queryByTestId('routines-archived')).toBeNull();
  });

  it('is collapsed until toggled, then lists the routine with a Restore button', () => {
    const onRestore = renderSection([ARCHIVED]);
    expect(screen.getByTestId('routines-archived-toggle')).toHaveTextContent('Archived (1)');
    expect(screen.queryByTestId('routines-archived-item-r3')).toBeNull();

    fireEvent.click(screen.getByTestId('routines-archived-toggle'));
    expect(screen.getByTestId('routines-archived-item-r3')).toHaveTextContent('Old Split');

    fireEvent.click(screen.getByRole('button', { name: 'Restore Old Split' }));
    expect(onRestore).toHaveBeenCalledWith(ARCHIVED);
  });
});
