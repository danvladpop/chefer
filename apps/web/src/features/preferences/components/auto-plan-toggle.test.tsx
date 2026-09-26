// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AutoPlanToggle } from './auto-plan-toggle';

const mutate = vi.fn();
vi.mock('@/lib/trpc', () => ({
  trpc: {
    preferences: {
      setAutoPlanWeekly: { useMutation: () => ({ mutate, isPending: false, isError: false }) },
    },
  },
}));

afterEach(cleanup);

describe('AutoPlanToggle (audit F-PLAN-4-3)', () => {
  it('is an accessible switch that saves the opt-out', () => {
    render(<AutoPlanToggle initialEnabled />);
    const toggle = screen.getByRole('switch', { name: 'Plan my week every Sunday' });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(toggle);
    expect(mutate).toHaveBeenCalledWith({ enabled: false });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
  });

  it('free accounts get the curated-week copy (P2-5)', () => {
    render(<AutoPlanToggle initialEnabled isPremium={false} />);
    expect(screen.getByText(/We pick a fresh week of recipes for you on Sunday/)).toBeTruthy();
    expect(screen.queryByText(/learning from what you rate/)).toBeNull();
  });
});
