// @vitest-environment jsdom
import { AppToastHost, resetAppToastForTests } from '@/lib/app-toast';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ShoppingListPage from './page';

// UX-SHOP-02 (undo): removing a custom item says "Removed · Undo"; Undo puts
// it back, and a failed Undo says so.

const m = vi.hoisted(() => ({
  removeMutate: vi.fn(),
  addMutate: vi.fn(),
  addFails: false,
  units: 'METRIC',
  extraItems: [] as Record<string, unknown>[],
  total: 0,
}));

vi.mock('next/image', () => ({
  default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} />,
}));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock('@/features/ai-consent/AiConsentProvider', () => ({ useAiConsent: () => vi.fn() }));
vi.mock('@/features/pantry/components/PantryCheckBanner', () => ({
  PantryCheckBanner: () => null,
}));
vi.mock('@/features/pantry/components/PantryGhostBanner', () => ({
  PantryGhostBanner: () => null,
}));
vi.mock('@/features/pantry/components/PantryPanel', () => ({ PantryPanel: () => null }));
vi.mock('@/features/premium/components/UpgradeButton', () => ({ UpgradeButton: () => null }));
vi.mock('@/features/safety/components/LabelCaveat', () => ({ LabelCaveat: () => null }));
vi.mock('@/features/shopping-list/components/ShareListDialog', () => ({
  ShareListDialog: () => null,
}));
vi.mock('@/hooks/useCurrency', () => ({ useCurrency: () => 'EUR' }));
vi.mock('@/hooks/useHousehold', () => ({ useHousehold: () => ({ memberCount: 0 }) }));
vi.mock('@/hooks/useIsPremium', () => ({ useIsPremium: () => false }));
vi.mock('@/hooks/useUnitSystem', () => ({ useUnitSystem: () => m.units }));
vi.mock('@/lib/analytics', () => ({ capture: vi.fn() }));

const list = {
  planId: 'p1',
  hasPlan: true,
  weekStartDate: new Date().toISOString(),
  items: [
    {
      key: 'custom:flour',
      ingredientName: 'Flour',
      category: 'other',
      quantity: '2',
      unit: 'kg',
      isCustom: true,
    },
  ],
  checkedKeys: [],
  estimatedTotalEur: 0,
  pantry: { entitled: false, savedEur: 0 },
};

vi.mock('@/lib/trpc', () => {
  const noopMutation = { mutate: vi.fn(), isPending: false, isError: false };
  const cache = { cancel: vi.fn(), getData: vi.fn(), setData: vi.fn(), invalidate: vi.fn() };
  return {
    trpc: {
      useUtils: () => ({
        shoppingList: { getForWeek: cache },
        pantry: { list: { invalidate: vi.fn() } },
      }),
      shoppingList: {
        getForWeek: {
          useQuery: () => ({
            data: { ...list, items: [...list.items, ...m.extraItems], estimatedTotalEur: m.total },
            isLoading: false,
            isError: false,
            isRefetching: false,
            refetch: vi.fn(),
          }),
        },
        toggleItems: { useMutation: () => noopMutation },
        regenerate: { useMutation: () => noopMutation },
        removeCustomItem: {
          useMutation: () => ({
            mutate: (vars: unknown, opts?: { onSuccess?: () => void }) => {
              m.removeMutate(vars);
              opts?.onSuccess?.();
            },
            isPending: false,
          }),
        },
        addCustomItems: {
          useMutation: (opts: { onError?: (e: Error) => void }) => ({
            mutate: (vars: unknown) => {
              m.addMutate(vars);
              if (m.addFails) opts.onError?.(new Error('boom'));
            },
            isPending: false,
          }),
        },
      },
      pantry: { markOutOfStock: { useMutation: () => noopMutation } },
      mealPlan: { getForWeek: { useQuery: () => ({ data: undefined }) } },
    },
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  m.addFails = false;
  m.units = 'METRIC';
  m.extraItems = [];
  m.total = 0;
  localStorage.removeItem('chefer.shopping-expanded.v2');
  resetAppToastForTests();
});
afterEach(cleanup);

function renderPage() {
  render(
    <>
      <ShoppingListPage />
      <AppToastHost />
    </>,
  );
}

describe('Shop: removing a custom item (UX-SHOP-02)', () => {
  it('says "Removed" with Undo, and Undo re-adds the item', async () => {
    renderPage();
    fireEvent.click(await screen.findByLabelText('Remove Flour from the list'));
    expect(m.removeMutate).toHaveBeenCalledWith({ planId: 'p1', key: 'custom:flour' });
    expect(await screen.findByText('Removed Flour')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(m.addMutate).toHaveBeenCalledWith({
      planId: 'p1',
      items: [{ name: 'Flour', quantity: 2, unit: 'kg' }],
    });
  });

  it('a failed Undo says so', async () => {
    m.addFails = true;
    renderPage();
    fireEvent.click(await screen.findByLabelText('Remove Flour from the list'));
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    });
    expect(await screen.findByText(/Couldn't put it back/)).toBeTruthy();
  });
});

describe('Shop: add item in the user’s units (UX-SHOP-01)', () => {
  it('teaches kg to a metric user and lb to an imperial one', () => {
    renderPage();
    expect(screen.getByPlaceholderText(/kg/)).toBeTruthy();
    cleanup();
    m.units = 'IMPERIAL';
    renderPage();
    expect(screen.getByPlaceholderText(/lb/)).toBeTruthy();
  });

  it('"2 lb chicken thighs" keeps its unit and the rest of the name', () => {
    renderPage();
    fireEvent.change(screen.getByLabelText('Add an item to the shopping list'), {
      target: { value: '2 lb chicken thighs' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add item to shopping list' }));
    expect(m.addMutate).toHaveBeenCalledWith({
      planId: 'p1',
      items: [{ name: 'chicken thighs', quantity: 2, unit: 'lb' }],
    });
  });
});

describe('Shop: aisles open and remembered (UX-SHOP-02)', () => {
  it('starts open, and closing an aisle is remembered on the device', async () => {
    renderPage();
    expect(await screen.findByText('Flour')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { expanded: true }));
    expect(screen.queryByText('Flour')).toBeNull();
    expect(JSON.parse(localStorage.getItem('chefer.shopping-expanded.v2') ?? '{}')).toEqual({
      other: false,
    });
  });

  it('an aisle closed last time is still closed', () => {
    localStorage.setItem('chefer.shopping-expanded.v2', JSON.stringify({ other: false }));
    renderPage();
    expect(screen.queryByText('Flour')).toBeNull();
  });
});

describe('Shop: numbers you can shop for (UX-SHOP-03)', () => {
  it('item prices are whole units, never to the cent', async () => {
    m.extraItems = [
      {
        key: 'p1-egg',
        ingredientName: 'Egg',
        category: 'other',
        quantity: '4',
        unit: 'pcs',
        estimatedPriceEur: 6.56,
      },
    ];
    renderPage();
    expect(await screen.findByText(/~€7/)).toBeTruthy();
    expect(screen.queryByText(/6\.56/)).toBeNull();
  });

  it('shows quantities in the user’s units', async () => {
    m.units = 'IMPERIAL';
    renderPage();
    // 2 kg of flour is 4.4 lb for an imperial user
    expect(await screen.findByText(/4\.4 lb/)).toBeTruthy();
  });
});
