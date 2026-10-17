// @vitest-environment jsdom
import { capture } from '@/lib/analytics';
import { AppToastHost, resetAppToastForTests } from '@/lib/app-toast';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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
  fromDay: undefined as number | undefined,
}));

vi.mock('next/image', () => ({
  default: ({ alt, src, onError }: { alt: string; src: string; onError?: () => void }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} src={src} onError={onError} data-testid="item-img" />
  ),
}));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
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
  pantry: { entitled: false, itemCount: 0, savedEur: 0 },
  fromDayOfWeek: undefined as number | undefined,
};

vi.mock('@/lib/trpc', () => {
  const noopMutation = { mutate: vi.fn(), isPending: false, isError: false };
  const cache = { cancel: vi.fn(), getData: vi.fn(), setData: vi.fn(), invalidate: vi.fn() };
  return {
    trpc: {
      useUtils: () => ({
        shoppingList: { getForWeek: cache },
      }),
      shoppingList: {
        getForWeek: {
          useQuery: () => ({
            data: {
              ...list,
              items: [...list.items, ...m.extraItems],
              estimatedTotalEur: m.total,
              fromDayOfWeek: m.fromDay,
            },
            isLoading: false,
            isError: false,
            isRefetching: false,
            refetch: vi.fn(),
          }),
        },
        toggleItems: { useMutation: () => noopMutation },
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
  m.fromDay = undefined;
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

describe('Shop: funnel (UX-PO-02)', () => {
  it('fires list_opened once per visit, with the item count, not on re-renders', async () => {
    const { rerender } = render(<ShoppingListPage />);
    await screen.findByLabelText('Remove Flour from the list');
    const opened = () => vi.mocked(capture).mock.calls.filter(([event]) => event === 'list_opened');
    expect(opened()).toHaveLength(1);
    expect(opened()[0]?.[1]).toEqual({ itemCount: 1 });
    rerender(<ShoppingListPage />);
    expect(opened()).toHaveLength(1);
  });
});

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

describe('Shop: no kitchen, no AI, provenance (FB7-10)', () => {
  it('has no "In my kitchen" segment and no Regenerate button', async () => {
    renderPage();
    await screen.findByLabelText('Remove Flour from the list');
    expect(screen.queryByTestId('shop-segment-kitchen')).toBeNull();
    expect(screen.queryByText(/In my kitchen/)).toBeNull();
    expect(screen.queryByRole('button', { name: /Regenerate/ })).toBeNull();
    expect(screen.queryByText('Have it')).toBeNull();
  });

  it('says where the list comes from: the whole week by default, the window mid-week', async () => {
    renderPage();
    expect((await screen.findByTestId('shop-provenance')).textContent).toBe(
      "From your plan's recipes · Mon–Sun",
    );
    cleanup();
    m.fromDay = 4;
    renderPage();
    expect((await screen.findByTestId('shop-provenance')).textContent).toBe(
      "From your plan's recipes · Fri–Sun",
    );
  });
});

describe('Shop: thumbnails are never blank (FB7-10)', () => {
  const item = (imageUrl: string) => ({
    key: 'a',
    ingredientName: 'Strawberries',
    category: 'produce',
    quantity: '200',
    unit: 'g',
    imageUrl,
  });

  it('shows the aisle icon when there is no image URL', async () => {
    m.extraItems = [item('')];
    renderPage();
    const row = (await screen.findByText('Strawberries')).closest('button') as HTMLElement;
    expect(within(row).getByTestId('item-thumb-fallback')).toBeTruthy();
    expect(within(row).queryByTestId('item-img')).toBeNull();
  });

  it('swaps the picture for the aisle icon when it fails to load', async () => {
    m.extraItems = [item('https://img.example/strawberries.jpg')];
    renderPage();
    const row = (await screen.findByText('Strawberries')).closest('button') as HTMLElement;
    const img = within(row).getByTestId('item-img');
    expect(within(row).queryByTestId('item-thumb-fallback')).toBeNull();
    fireEvent.error(img);
    expect(await within(row).findByTestId('item-thumb-fallback')).toBeTruthy();
    expect(within(row).queryByTestId('item-img')).toBeNull();
  });
});
