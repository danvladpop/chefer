// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BudgetSection } from './budget-section';

// UX-ACC-23: the cap is visible, and a bad amount is flagged inline.

afterEach(cleanup);

describe('BudgetSection (UX-ACC-23)', () => {
  it('shows the cap', () => {
    render(<BudgetSection isPremium weeklyBudget="60" deliveryCurrency="EUR" onChange={vi.fn()} />);
    expect(screen.getByText('Up to €2000 a week.')).toBeTruthy();
  });

  it('flags an amount over the cap instead of letting it be capped silently', () => {
    render(
      <BudgetSection isPremium weeklyBudget="5000" deliveryCurrency="EUR" onChange={vi.fn()} />,
    );
    expect(screen.getByRole('alert').textContent).toMatch(/most you can set is €2000/);
    expect(screen.getByLabelText('Weekly budget').getAttribute('aria-invalid')).toBe('true');
  });

  it('renders nothing for free users', () => {
    const { container } = render(
      <BudgetSection isPremium={false} weeklyBudget="" deliveryCurrency="EUR" onChange={vi.fn()} />,
    );
    expect(container.textContent).toBe('');
  });
});
