// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WeekOptionsSheet } from './WeekOptionsSheet';

// FB7-11: the two described actions; Rebalance is disabled — with the reason —
// when the check found nothing, and absent for a week that cannot be rebalanced.

vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
afterEach(cleanup);

const base = { open: true, onClose: vi.fn(), onRegenerate: vi.fn(), regenerating: false };

describe('WeekOptionsSheet', () => {
  it('"New meal plan" closes the sheet and opens the confirm', () => {
    const onClose = vi.fn();
    const onRegenerate = vi.fn();
    render(<WeekOptionsSheet {...base} onClose={onClose} onRegenerate={onRegenerate} />);
    fireEvent.click(screen.getByTestId('plan-week-options-regenerate'));
    expect(onClose).toHaveBeenCalled();
    expect(onRegenerate).toHaveBeenCalled();
    // Next week: no rebalance row at all.
    expect(screen.queryByTestId('plan-week-options-rebalance')).toBeNull();
  });

  it('Rebalance is enabled until checked, then disabled with the on-target reason', () => {
    const onPress = vi.fn();
    const { rerender } = render(
      <WeekOptionsSheet {...base} rebalance={{ state: 'idle', onPress }} />,
    );
    fireEvent.click(screen.getByTestId('plan-week-options-rebalance'));
    expect(onPress).toHaveBeenCalledOnce();
    rerender(<WeekOptionsSheet {...base} rebalance={{ state: 'on-track', onPress }} />);
    expect(screen.getByTestId('plan-week-options-rebalance')).toHaveProperty('disabled', true);
    expect(screen.getByTestId('plan-week-options-rebalance-description').textContent).toBe(
      'Your week is already on target, so there is nothing to swap.',
    );
  });
});
