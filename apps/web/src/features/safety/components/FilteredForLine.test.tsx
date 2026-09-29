// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FilteredForLine } from './FilteredForLine';

afterEach(cleanup);

describe('FilteredForLine (UX-02 T-02.5)', () => {
  it('states the filters and the hidden count', () => {
    render(<FilteredForLine filters="vegan + gluten-free" hiddenCount={14} />);
    expect(screen.getByLabelText('Filtered for vegan + gluten-free · 14 hidden')).toBeTruthy();
  });

  it('opens the What-we-check sheet on click', () => {
    const onOpenSheet = vi.fn();
    render(<FilteredForLine filters="tree nuts" hiddenCount={3} onOpenSheet={onOpenSheet} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onOpenSheet).toHaveBeenCalledTimes(1);
  });
});
