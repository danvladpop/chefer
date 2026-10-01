// @vitest-environment jsdom
import IngredientsPage from '@/app/(dashboard)/ingredients/page';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The catalog-backed Ingredients page (plan-ingredient-catalog §10): a source
// badge (USDA / CIQUAL / Label / Mine), aliases and portions per row; global
// nutrition is read-only, the owner edits private rows, admins only price and
// image of global rows.

const mocks = vi.hoisted(() => ({ listInput: vi.fn() }));

vi.mock('@/lib/upload-image', () => ({ uploadImage: vi.fn() }));
vi.mock('@/hooks/useCurrency', () => ({ useCurrency: () => 'EUR' }));
vi.mock('@/lib/trpc', () => {
  const base = {
    status: 'ACTIVE',
    hasDensity: false,
    densityGPerMl: null,
    edibleFraction: 1,
    sourceRef: 'fdc:1',
    imageUrl: 'https://cdn/x.png',
    slug: 'x',
  };
  const items = [
    {
      ...base,
      id: 'p1',
      name: 'Lidl Skyr',
      category: 'DAIRY_YOGURT_CREAM',
      owner: 'mine',
      nutritionSource: 'USER',
      portions: [],
      per100g: { calories: 63, protein: 11, carbs: 4, fat: 0.2, fiber: 0 },
      aliases: [{ alias: 'lidl skyr', locale: 'en' }],
      prices: null,
      priceRowName: 'lidl skyr',
      editable: 'full',
    },
    {
      ...base,
      id: 'garlic',
      name: 'Garlic, raw',
      category: 'VEGETABLE',
      owner: 'global',
      nutritionSource: 'USDA_FDC',
      portions: [{ unit: 'clove', grams: 3 }],
      per100g: { calories: 149, protein: 6.4, carbs: 31, fat: 0.5, fiber: 2.1 },
      aliases: [
        { alias: 'garlic raw', locale: 'en' },
        { alias: 'usturoi', locale: 'ro' },
      ],
      prices: { per100gEur: 0.9, per100mlEur: null, perPieceEur: null },
      priceRowName: 'garlic',
      editable: 'none',
    },
    {
      ...base,
      id: 'telemea',
      name: 'Telemea',
      category: 'DAIRY_CHEESE',
      owner: 'global',
      nutritionSource: 'CIQUAL',
      portions: [],
      per100g: { calories: 260, protein: 17, carbs: 1, fat: 21, fiber: 0 },
      aliases: [],
      prices: null,
      priceRowName: null,
      editable: 'none',
    },
  ];
  const idle = { mutate: vi.fn(), isPending: false, isError: false, error: null };
  return {
    trpc: {
      useUtils: () => ({}),
      ingredients: {
        catalogList: {
          useInfiniteQuery: (input: unknown) => {
            mocks.listInput(input);
            return {
              data: { pages: [{ items, hasMore: false, nextCursor: null }] },
              isLoading: false,
              hasNextPage: false,
              isFetchingNextPage: false,
              fetchNextPage: vi.fn(),
            };
          },
        },
        delete: { useMutation: () => idle },
      },
    },
  };
});

vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
afterEach(cleanup);
beforeEach(() => mocks.listInput.mockClear());

describe('IngredientsPage', () => {
  it('shows each row’s source, portions and other names', () => {
    render(<IngredientsPage />);
    const cards = screen.getAllByTestId('ingredient-card');
    expect(cards).toHaveLength(3);
    const [skyr, garlic, telemea] = cards as [HTMLElement, HTMLElement, HTMLElement];
    expect(within(skyr).getByText('Mine')).toBeTruthy();
    expect(within(garlic).getByText('USDA')).toBeTruthy();
    expect(within(telemea).getByText('CIQUAL')).toBeTruthy();
    expect(within(garlic).getByText('1 clove = 3 g')).toBeTruthy();
    expect(within(garlic).getByText('Also called (1)')).toBeTruthy();
    expect(within(garlic).getByText('usturoi')).toBeTruthy();
  });

  it('only the owner’s private rows can be edited and deleted; global nutrition is read-only', () => {
    render(<IngredientsPage />);
    expect(screen.getByRole('button', { name: 'Edit Lidl Skyr' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete Lidl Skyr' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Garlic, raw/ })).toBeNull();
  });

  it('“My ingredients” lists only the user’s own rows', () => {
    render(<IngredientsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'My ingredients' }));
    expect(mocks.listInput).toHaveBeenLastCalledWith(expect.objectContaining({ mineOnly: true }));
  });
});
