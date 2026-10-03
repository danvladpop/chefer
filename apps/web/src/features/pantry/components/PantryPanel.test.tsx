// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PantryPanel } from './PantryPanel';

// UX-X-12: a failed pantry load is not an empty kitchen.

const m = vi.hoisted(() => ({
  query: { data: undefined, isLoading: false, isError: true },
  refetch: vi.fn(),
}));

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock('@/features/premium/components/UpgradeButton', () => ({ UpgradeButton: () => null }));
vi.mock('@/hooks/useEntitlement', () => ({
  useEntitlement: () => ({ enabled: true, isPremium: true }),
}));
vi.mock('./PantryCheckBanner', () => ({ PantryCheckBanner: () => null }));
vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({ pantry: { list: { invalidate: vi.fn() } } }),
    pantry: {
      list: { useQuery: () => ({ ...m.query, refetch: m.refetch }) },
      addItem: { useMutation: () => ({ mutate: vi.fn(), isPending: false, isError: false }) },
      removeItem: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
  },
}));

afterEach(cleanup);

describe('PantryPanel failed load (UX-X-12)', () => {
  it('shows an error with Try again, not the empty-kitchen hint', () => {
    render(<PantryPanel />);
    expect(screen.getByTestId('pantry-load-error')).toBeTruthy();
    expect(screen.queryByText('Nothing tracked yet')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(m.refetch).toHaveBeenCalled();
  });
});
