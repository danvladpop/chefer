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
vi.mock('@/hooks/useUnitSystem', () => ({ useUnitSystem: () => 'METRIC' }));
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
            data: list,
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
  sessionStorage.setItem('chefer.shopping-expanded', JSON.stringify({ other: true }));
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
