// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CheckedForChip } from './CheckedForChip';

afterEach(cleanup);

describe('CheckedForChip (UX-02 T-02.2)', () => {
  it('shows the compact count with a spelled-out a11y label', () => {
    render(<CheckedForChip labels={['tree nuts', 'fish', 'vegetarian']} />);
    expect(screen.getByLabelText('Checked for tree nuts, fish and vegetarian')).toBeTruthy();
    // UX-PLAN-12: "3 checks passed", not "Checked for 3" (which read like a head count).
    expect(screen.getByText('3 checks passed')).toBeTruthy();
  });

  it('renders nothing when there is nothing to check', () => {
    const { container } = render(<CheckedForChip labels={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
