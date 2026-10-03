// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RoutineListItemDto } from '@chefer/types';
import { RoutineListCard } from './RoutineListCard';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const ROUTINE: RoutineListItemDto = {
  id: 'r1',
  name: 'Push Pull Legs',
  templateKey: null,
  isActive: false,
  dayCount: 3,
  archived: false,
  updatedAt: '2026-09-20T00:00:00.000Z',
};

function renderCard(routine: RoutineListItemDto, onArchive = vi.fn()) {
  render(
    <RoutineListCard
      routine={routine}
      onSetActive={vi.fn()}
      onDuplicate={vi.fn()}
      onArchive={onArchive}
    />,
  );
  return onArchive;
}

describe('RoutineListCard archive confirm', () => {
  it('UX-GYM-15: archiving the ACTIVE routine warns that Today will have no workout', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onArchive = renderCard({ ...ROUTINE, isActive: true });
    fireEvent.click(screen.getByRole('button', { name: /archive/i }));
    expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/is your active routine\. Today/));
    expect(onArchive).toHaveBeenCalledTimes(1);
  });

  it('a non-active routine keeps the plain confirm, and Cancel archives nothing', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const onArchive = renderCard(ROUTINE);
    fireEvent.click(screen.getByRole('button', { name: /archive/i }));
    expect(confirm).toHaveBeenCalledWith(expect.not.stringMatching(/active routine/));
    expect(onArchive).not.toHaveBeenCalled();
  });
});
