// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConflictDialog } from './ConflictDialog';

afterEach(cleanup);
vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);

describe('ConflictDialog', () => {
  it('keeps the generic copy when nobody is named (older clients, no coaching)', () => {
    render(<ConflictDialog open onKeepMine={vi.fn()} onUseTheirs={vi.fn()} />);
    expect(screen.getByText('This routine changed elsewhere')).toBeInTheDocument();
  });

  it('names the other person, on both sides', () => {
    const onKeepMine = vi.fn();
    const onUseTheirs = vi.fn();
    render(
      <ConflictDialog open changedBy="Ana" onKeepMine={onKeepMine} onUseTheirs={onUseTheirs} />,
    );
    expect(screen.getByText('Ana changed this routine while you were editing')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keep mine' }));
    fireEvent.click(screen.getByRole('button', { name: 'Use the other version' }));
    expect(onKeepMine).toHaveBeenCalledTimes(1);
    expect(onUseTheirs).toHaveBeenCalledTimes(1);
  });
});
