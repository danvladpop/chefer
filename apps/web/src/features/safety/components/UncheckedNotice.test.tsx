// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UncheckedNotice } from './UncheckedNotice';

afterEach(cleanup);

describe('UncheckedNotice (UX-01 "Something else" + UX-22 T-22.1)', () => {
  it('unrecognised: names the term and offers Keep as a note / Remove', () => {
    const onKeepNote = vi.fn();
    const onRemove = vi.fn();
    render(<UncheckedNotice term="zzz" onKeepNote={onKeepNote} onRemove={onRemove} />);
    expect(screen.getByRole('alert').textContent).toMatch(/can.t check for .zzz. yet/);
    fireEvent.click(screen.getByRole('button', { name: 'Keep as a note' }));
    expect(onKeepNote).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('condition: offers Choose a goal / OK and never makes a clinical claim', () => {
    const onChooseGoal = vi.fn();
    const onDismiss = vi.fn();
    render(
      <UncheckedNotice
        variant="condition"
        term="pre-diabetes"
        onChooseGoal={onChooseGoal}
        onDismiss={onDismiss}
      />,
    );
    expect(screen.getByText(/pre-diabetes/)).toBeTruthy();
    expect(screen.queryByText(/medical advice/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Choose a goal' }));
    expect(onChooseGoal).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
