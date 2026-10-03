// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PantryPanel } from './PantryPanel';

// UX-X-12: a failed pantry load is not an empty kitchen.
// WP-11 (UX-SHOP-05/07): every tier can remove, edit and Undo; the amount box
// refuses "abc" / "-5"; quantities and unit options follow the user's units.

type Toast = { message: string; action: { label: string; onClick: () => void } };
type Query = {
  data: { items: unknown[]; count: number } | undefined;
  isLoading: boolean;
  isError: boolean;
};

function initialQuery(): Query {
  return { data: undefined, isLoading: false, isError: true };
}

const m = vi.hoisted(() => ({
  query: initialQuery(),
  refetch: vi.fn(),
  premium: true,
  units: 'METRIC',
  add: vi.fn(),
  remove: vi.fn(),
  restore: vi.fn(),
  update: vi.fn(),
  toasts: [] as Toast[],
  removeOptions: undefined as undefined | { onSuccess?: (r: unknown) => void },
}));

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock('@/features/premium/components/UpgradeButton', () => ({ UpgradeButton: () => null }));
vi.mock('@/hooks/useEntitlement', () => ({
  useEntitlement: () => ({ enabled: m.premium, isPremium: m.premium }),
}));
vi.mock('@/hooks/useUnitSystem', () => ({ useUnitSystem: () => m.units }));
vi.mock('@/lib/app-toast', () => ({
  showAppToast: (t: Toast) => m.toasts.push(t),
}));
vi.mock('./PantryCheckBanner', () => ({ PantryCheckBanner: () => null }));
vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      pantry: { list: { invalidate: vi.fn() } },
      shoppingList: { getForWeek: { invalidate: vi.fn() } },
    }),
    pantry: {
      list: { useQuery: () => ({ ...m.query, refetch: m.refetch }) },
      addItem: { useMutation: () => ({ mutate: m.add, isPending: false, isError: false }) },
      removeItem: {
        useMutation: (options: { onSuccess?: (r: unknown) => void }) => {
          m.removeOptions = options;
          return { mutate: m.remove, isPending: false };
        },
      },
      restoreItem: { useMutation: () => ({ mutate: m.restore, isPending: false }) },
      updateItem: {
        useMutation: () => ({ mutate: m.update, isPending: false, isError: false }),
      },
    },
  },
}));

const rice = {
  id: 'p-rice',
  ingredientName: 'rice',
  quantity: 500,
  unit: 'g',
  source: 'PURCHASE',
  updatedAt: new Date().toISOString(),
};

beforeEach(() => {
  vi.clearAllMocks();
  m.toasts = [];
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  m.premium = true;
  m.units = 'METRIC';
  m.query = { data: undefined, isLoading: false, isError: true };
});
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

describe('PantryPanel (UX-SHOP-05/07)', () => {
  beforeEach(() => {
    m.query = { data: { items: [rice], count: 1 }, isLoading: false, isError: false };
  });

  it('a FREE user can remove a row, and Undo puts it back through restoreItem', () => {
    m.premium = false;
    render(<PantryPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove rice from your kitchen' }));
    expect(m.remove).toHaveBeenCalledWith({ id: 'p-rice' });

    m.removeOptions?.onSuccess?.({ ok: true, removed: rice });
    const toast = m.toasts[0];
    if (!toast) throw new Error('expected a toast');
    expect(toast.message).toBe('Removed rice');
    expect(toast.action.label).toBe('Undo');
    toast.action.onClick();
    expect(m.restore).toHaveBeenCalledWith({
      ingredientName: 'rice',
      quantity: 500,
      unit: 'g',
      source: 'PURCHASE',
    });
  });

  it('"abc" in the amount box is refused with a message, not saved as "some left"', () => {
    render(<PantryPanel />);
    fireEvent.change(screen.getByLabelText('Add an item to your kitchen'), {
      target: { value: 'flour' },
    });
    fireEvent.change(screen.getByLabelText('Quantity (optional)'), { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add to pantry' }));
    expect(screen.getByRole('alert').textContent).toMatch(/above zero/);
    expect(m.add).not.toHaveBeenCalled();
  });

  it('a valid amount is sent as a number', () => {
    render(<PantryPanel />);
    fireEvent.change(screen.getByLabelText('Add an item to your kitchen'), {
      target: { value: 'flour' },
    });
    fireEvent.change(screen.getByLabelText('Quantity (optional)'), { target: { value: '2,5' } });
    fireEvent.change(screen.getByLabelText('Unit'), { target: { value: 'kg' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add to pantry' }));
    expect(m.add).toHaveBeenCalledWith({ name: 'flour', quantity: 2.5, unit: 'kg' });
  });

  it('an imperial user sees pounds and lb/oz options, not grams', () => {
    m.units = 'IMPERIAL';
    render(<PantryPanel />);
    expect(screen.getByText(/1\.1 lb/)).toBeTruthy();
    const options = [...screen.getByLabelText('Unit').querySelectorAll('option')].map(
      (o) => o.value,
    );
    expect(options).toContain('lb');
    expect(options).not.toContain('kg');
  });

  it('the edit sheet saves a new amount for any tier', () => {
    m.premium = false;
    render(<PantryPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit rice' }));
    const qty = screen.getByLabelText(/Amount/);
    expect((qty as HTMLInputElement).value).toBe('500');
    fireEvent.change(qty, { target: { value: '250' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(m.update).toHaveBeenCalledWith({ id: 'p-rice', quantity: 250, unit: 'g' });
  });

  it('the edit sheet refuses a negative amount', () => {
    render(<PantryPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit rice' }));
    fireEvent.change(screen.getByLabelText(/Amount/), { target: { value: '-5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(m.update).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toMatch(/above zero/);
  });
});
