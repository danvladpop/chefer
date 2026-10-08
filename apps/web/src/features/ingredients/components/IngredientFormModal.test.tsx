// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IngredientFormModal, type CatalogListItem } from './IngredientFormModal';

// The private-ingredient sheet (plan-ingredient-catalog §8.1, D5, D7): the
// five core values are required; a CONFLICT offers Chefer's row or an
// explicit "No, mine is different" (confirmDifferent); an admin edits only a
// global row's price and image.

const mocks = vi.hoisted(() => ({
  createMutate: vi.fn(),
  updateMutate: vi.fn(),
  createError: null as null | ((err: unknown) => Promise<void>),
  resolveFetch: vi.fn(),
  estimateMutate: vi.fn(),
}));

// R-10: "Fill in for me" asks for AI-data consent first; the guard is a stub
// that either allows (runs the action) or declines.
const consent = vi.hoisted(() => ({ granted: true, request: vi.fn() }));
vi.mock('@/features/ai-consent/AiConsentProvider', () => ({
  useAiConsent: () => (feature: string, run: () => void) => {
    consent.request(feature);
    if (consent.granted) run();
  },
}));
vi.mock('@/lib/upload-image', () => ({ uploadImage: vi.fn() }));
vi.mock('@/lib/trpc', () => {
  const idle = { isPending: false, isError: false, isSuccess: false, data: undefined, error: null };
  return {
    trpc: {
      useUtils: () => ({ ingredients: { resolve: { fetch: mocks.resolveFetch } } }),
      ingredients: {
        createCustom: {
          useMutation: (opts: { onError: (err: unknown) => Promise<void> }) => {
            mocks.createError = opts.onError;
            return { ...idle, mutate: mocks.createMutate };
          },
        },
        update: { useMutation: () => ({ ...idle, mutate: mocks.updateMutate }) },
        estimateNutrition: { useMutation: () => ({ ...idle, mutate: mocks.estimateMutate }) },
      },
    },
  };
});

vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
afterEach(cleanup);
beforeEach(() => {
  mocks.createMutate.mockClear();
  mocks.updateMutate.mockClear();
  mocks.resolveFetch.mockReset();
  mocks.estimateMutate.mockClear();
  consent.request.mockClear();
  consent.granted = true;
});

function fillMacros(values: Partial<Record<string, string>> = {}) {
  const v = { energy: '380', protein: '10', carbs: '60', fat: '9', fiber: '3', ...values };
  fireEvent.change(screen.getByLabelText('Energy (kcal)'), { target: { value: v.energy } });
  fireEvent.change(screen.getByLabelText('Protein (g)'), { target: { value: v.protein } });
  fireEvent.change(screen.getByLabelText('Carbs (g)'), { target: { value: v.carbs } });
  fireEvent.change(screen.getByLabelText('Fat (g)'), { target: { value: v.fat } });
  fireEvent.change(screen.getByLabelText('Fiber (g)'), { target: { value: v.fiber } });
}

describe('IngredientFormModal — create', () => {
  it('requires all five core values per 100 g', () => {
    render(
      <IngredientFormModal
        mode="create"
        initialName="Lidl skyr"
        onSaved={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText('Energy (kcal)'), { target: { value: '63' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create ingredient' }));
    expect(mocks.createMutate).not.toHaveBeenCalled();
    const protein = screen.getByLabelText('Protein (g)');
    expect(protein.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getAllByText(/Required — copy it from the label/).length).toBe(4);
  });

  it('rejects macros that add up to more than 100 g', () => {
    render(
      <IngredientFormModal
        mode="create"
        initialName="Odd bar"
        onSaved={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    fillMacros({ protein: '50', carbs: '60' });
    fireEvent.click(screen.getByRole('button', { name: 'Create ingredient' }));
    expect(mocks.createMutate).not.toHaveBeenCalled();
    expect(screen.getByText(/add up to more than 100 g/)).toBeTruthy();
  });

  it('on CONFLICT offers Chefer’s row, or resends with confirmDifferent', async () => {
    const onUseExisting = vi.fn();
    mocks.resolveFetch.mockResolvedValue([
      {
        match: {
          id: 'skyr',
          slug: 'skyr',
          name: 'Skyr, plain',
          category: 'DAIRY_YOGURT_CREAM',
          owner: 'global',
          portions: [],
          hasDensity: true,
          nutritionSource: 'CIQUAL',
        },
      },
    ]);
    render(
      <IngredientFormModal
        mode="create"
        initialName="skyr"
        onSaved={vi.fn()}
        onUseExisting={onUseExisting}
        onClose={vi.fn()}
      />,
    );
    fillMacros();
    fireEvent.click(screen.getByRole('button', { name: 'Create ingredient' }));
    expect(mocks.createMutate).toHaveBeenCalledWith(
      expect.not.objectContaining({ confirmDifferent: true }),
    );
    await mocks.createError?.({ data: { code: 'CONFLICT' }, message: 'Chefer already has…' });
    expect(await screen.findByText('Skyr, plain')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'No, mine is different' }));
    expect(mocks.createMutate).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: 'skyr', confirmDifferent: true, caloriesPer100g: 380 }),
    );

    await mocks.createError?.({ data: { code: 'CONFLICT' }, message: 'Chefer already has…' });
    fireEvent.click(await screen.findByRole('button', { name: 'Use it' }));
    await waitFor(() =>
      expect(onUseExisting).toHaveBeenCalledWith(expect.objectContaining({ id: 'skyr' })),
    );
  });
});

describe('IngredientFormModal — edit', () => {
  const item = {
    id: 'garlic',
    slug: 'garlic-raw',
    name: 'Garlic, raw',
    category: 'VEGETABLE',
    owner: 'global',
    portions: [{ unit: 'clove', grams: 3 }],
    hasDensity: false,
    nutritionSource: 'USDA_FDC',
    status: 'ACTIVE',
    per100g: {
      calories: 149,
      protein: 6.4,
      carbs: 31,
      fat: 0.5,
      fiber: 2.1,
      sugar: null,
      satFat: null,
      sodiumMg: null,
    },
    densityGPerMl: null,
    edibleFraction: 1,
    sourceRef: 'fdc:1',
    imageUrl: 'https://cdn/garlic.png',
    aliases: [{ alias: 'garlic', locale: 'en' }],
    prices: { per100gEur: 0.9, per100mlEur: null, perPieceEur: null },
    priceRowName: 'garlic',
    editable: 'priceImage',
  } as CatalogListItem;

  it('a global row: nutrition is read-only, the admin edits price and image (D7)', () => {
    render(<IngredientFormModal mode="edit" item={item} onSaved={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByLabelText('Energy (kcal)')).toBeNull();
    expect(screen.getByText(/149 kcal/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Per 100 g'), { target: { value: '1.2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(mocks.updateMutate).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'garlic', pricePer100gEur: 1.2, caloriesPer100g: 149 }),
    );
  });

  it('an own private row edits everything by id', () => {
    render(
      <IngredientFormModal
        mode="edit"
        item={{ ...item, owner: 'mine', nutritionSource: 'USER', editable: 'full', id: 'p1' }}
        onSaved={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText('Energy (kcal)'), { target: { value: '150' } });
    fireEvent.change(screen.getByLabelText('Grams per ml (optional)'), {
      target: { value: '1.1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(mocks.updateMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'p1',
        caloriesPer100g: 150,
        densityGPerMl: 1.1,
        category: 'VEGETABLE',
      }),
    );
  });
});

describe('IngredientFormModal — "Fill in for me" AI consent (R-10)', () => {
  const open = () =>
    render(
      <IngredientFormModal
        mode="create"
        initialName="oat bran"
        onSaved={vi.fn()}
        onClose={vi.fn()}
      />,
    );

  it('asks for AI consent (ingredient-estimate) and then estimates the typed name', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Fill in for me' }));
    expect(consent.request).toHaveBeenCalledWith('ingredient-estimate');
    expect(mocks.estimateMutate).toHaveBeenCalledWith({ name: 'oat bran' });
  });

  it('sends nothing when the user declines', () => {
    consent.granted = false;
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Fill in for me' }));
    expect(consent.request).toHaveBeenCalledWith('ingredient-estimate');
    expect(mocks.estimateMutate).not.toHaveBeenCalled();
  });
});
