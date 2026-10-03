// @vitest-environment jsdom
import { catalogRef } from '@/test-support/catalog-trpc';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ImportRecipeSheet } from './ImportRecipeSheet';

// Cheferize review (plan-ingredient-catalog §6.2, §10): each line comes back
// matched to the catalog or with suggestions; the user picks, the save sends
// the ingredientIds and is blocked while lines need data unless incomplete
// nutrition is explicitly accepted (acceptPartial). No "estimate" banner.

const mocks = vi.hoisted(() => ({
  previewMutate: vi.fn(),
  saveMutate: vi.fn((_input: Record<string, unknown>) => undefined),
  onPreviewSuccess: null as null | ((data: unknown) => void),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/analytics', () => ({ capture: vi.fn() }));
vi.mock('@/lib/upload-image', () => ({ uploadImage: vi.fn() }));
vi.mock('@/hooks/useEntitlement', () => ({ useEntitlement: () => ({ isPremium: true }) }));
vi.mock('@/features/ai-consent/AiConsentProvider', () => ({
  useAiConsent: () => (_feature: string, run: () => void) => run(),
}));
vi.mock('@/features/premium/components/UpgradeButton', () => ({
  UpgradeButton: () => <button type="button">Upgrade</button>,
}));
vi.mock('@/lib/trpc', async () => {
  const { catalogIngredientsMock, catalogUtilsMock } = await import('@/test-support/catalog-trpc');
  const idle = { mutate: vi.fn(), reset: vi.fn(), isPending: false, isError: false, error: null };
  return {
    trpc: {
      useUtils: () => ({ ...catalogUtilsMock(), recipe: { list: { invalidate: vi.fn() } } }),
      ingredients: catalogIngredientsMock(),
      recipe: {
        importPreview: {
          useMutation: (opts: { onSuccess: (data: unknown) => void }) => {
            mocks.onPreviewSuccess = opts.onSuccess;
            return { ...idle, mutate: mocks.previewMutate };
          },
        },
        importSave: { useMutation: () => ({ ...idle, mutate: mocks.saveMutate }) },
        importVideoPreview: { useMutation: () => idle },
      },
    },
  };
});

vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
afterEach(cleanup);
beforeEach(() => {
  mocks.previewMutate.mockClear();
  mocks.saveMutate.mockClear();
});

const RECIPE = {
  name: 'Chicken in oil',
  description: 'Simple.',
  ingredients: [
    { name: 'chicken breast', quantity: 300, unit: 'g' },
    { name: 'oliv oil', quantity: 1, unit: 'tbsp' },
  ],
  instructions: ['Cook it.'],
  nutritionInfo: { calories: 999, protein: 1, carbs: 1, fat: 1, fiber: 0 },
  cuisineType: 'Any',
  dietaryTags: [],
  prepTimeMins: 5,
  cookTimeMins: 10,
  servings: 2,
};

const RESOLUTION = [
  {
    rawName: 'chicken breast',
    unit: 'g',
    note: null,
    confidence: 'ALIAS',
    match: catalogRef('chicken'),
    candidates: [],
    grams: 300,
  },
  {
    rawName: 'oliv oil',
    unit: 'tbsp',
    note: null,
    confidence: 'CANDIDATES',
    match: null,
    candidates: [catalogRef('oil')],
    grams: null,
    problem: 'NO_INGREDIENT',
  },
];

const ADAPTED = {
  ...RECIPE,
  name: 'Chicken in oil (lighter)',
  ingredients: [{ name: 'chicken breast', quantity: 250, unit: 'g' }],
};
const ADAPTED_RESOLUTION = [RESOLUTION[0]];

async function openReview(opts: { adapted?: boolean } = {}) {
  render(<ImportRecipeSheet open onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: /Paste/ }));
  fireEvent.change(screen.getByPlaceholderText(/Paste the whole recipe/), {
    target: { value: 'A long enough pasted recipe text for the preview.' },
  });
  fireEvent.click(screen.getByText('Preview import'));
  expect(mocks.previewMutate).toHaveBeenCalled();
  mocks.onPreviewSuccess?.({
    via: 'text',
    original: RECIPE,
    adapted: opts.adapted ? ADAPTED : RECIPE,
    changes: opts.adapted ? [{ kind: 'swap', description: 'Used less chicken' }] : [],
    safety: { ok: true, issues: [] },
    macroCheck: {
      status: 'uncertain',
      computedCaloriesPerServing: null,
      statedCaloriesPerServing: 999,
    },
    sourceUrl: 'https://blog.example.com/chicken',
    ogImageUrl: null,
    resolution: {
      original: RESOLUTION,
      adapted: opts.adapted ? ADAPTED_RESOLUTION : RESOLUTION,
    },
    nutritionStatus: { original: 'PARTIAL', adapted: 'PARTIAL' },
  });
  await screen.findByTestId('video-draft-form');
}

describe('ImportRecipeSheet — Cheferize review', () => {
  it('drops the old "estimate uncertain" banner and shows each unmatched line with suggestions', async () => {
    await openReview();
    expect(screen.queryByText(/estimate uncertain/i)).toBeNull();
    expect(screen.getByRole('button', { name: 'Ingredient 1: Chicken breast, raw' })).toBeTruthy();
    expect(screen.getByText(/Pick a match for/)).toBeTruthy();
    expect(screen.getByText(/Incomplete — 1 ingredient needs data/)).toBeTruthy();
  });

  it('blocks the save while a line needs data, unless incomplete nutrition is accepted', async () => {
    await openReview();
    fireEvent.click(screen.getByText('Save original recipe'));
    expect(mocks.saveMutate).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toMatch(/1 ingredient needs a match/);

    fireEvent.click(screen.getByLabelText('Save with incomplete nutrition'));
    fireEvent.click(screen.getByText('Save original recipe'));
    expect(mocks.saveMutate).toHaveBeenCalledWith(
      expect.objectContaining({ acceptPartial: true, variant: 'original' }),
    );
  });

  it('sends the picked ingredientIds with acceptPartial false once every line matches', async () => {
    await openReview();
    fireEvent.click(screen.getByRole('button', { name: 'Olive oil' }));
    await waitFor(() => expect(screen.getByText(/computed from 2 ingredients/)).toBeTruthy());
    fireEvent.click(screen.getByText('Save original recipe'));
    const sent = mocks.saveMutate.mock.calls[0]?.[0] as {
      acceptPartial: boolean;
      recipe: { ingredients: unknown[] };
    };
    expect(sent.acceptPartial).toBe(false);
    expect(sent.recipe.ingredients).toEqual([
      { name: 'chicken breast', quantity: 300, unit: 'g', ingredientId: 'chicken' },
      { name: 'oliv oil', quantity: 1, unit: 'tbsp', ingredientId: 'oil' },
    ]);
  });
});

// UX-REC-15 (web twin of the phone's import review): the link/text review is the
// same editable form as a video draft — choose the version, fix it inline, save.
describe('ImportRecipeSheet — editable review (UX-REC-15)', () => {
  it('lets every field be corrected before saving, and saves the edited recipe', async () => {
    await openReview();
    fireEvent.change(screen.getByLabelText('Recipe name'), {
      target: { value: 'Weeknight chicken' },
    });
    fireEvent.change(screen.getByLabelText('Servings'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('Step 1'), {
      target: { value: 'Roast it for 20 min.' },
    });
    fireEvent.click(screen.getByLabelText('Save with incomplete nutrition'));
    fireEvent.click(screen.getByText('Save original recipe'));

    const sent = mocks.saveMutate.mock.calls[0]?.[0] as {
      variant: string;
      sourceUrl: string;
      recipe: { name: string; servings: number; instructions: string[] };
    };
    expect(sent.variant).toBe('original');
    expect(sent.sourceUrl).toBe('https://blog.example.com/chicken');
    expect(sent.recipe).toMatchObject({
      name: 'Weeknight chicken',
      servings: 4,
      instructions: ['Roast it for 20 min.'],
    });
  });

  it('blocks a save with a problem the form can name (no amount, no name)', async () => {
    await openReview();
    fireEvent.change(screen.getByLabelText('Recipe name'), { target: { value: '  ' } });
    fireEvent.click(screen.getByText('Save original recipe'));
    expect(mocks.saveMutate).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toMatch(/name/i);
  });

  it('choosing the Cheferized version reviews and saves THAT version', async () => {
    await openReview({ adapted: true });
    // Default is the adapted version when it has changes.
    expect(screen.getByLabelText('Recipe name')).toHaveProperty(
      'value',
      'Chicken in oil (lighter)',
    );
    expect(screen.getByText('Switching version restarts the review below.')).toBeTruthy();
    fireEvent.click(screen.getByText('Save Cheferized recipe'));
    expect(mocks.saveMutate).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'adapted', acceptPartial: false }),
    );
  });

  it('switching version restarts the review with that version’s draft', async () => {
    await openReview({ adapted: true });
    fireEvent.change(screen.getByLabelText('Recipe name'), { target: { value: 'My edit' } });
    fireEvent.click(screen.getByText('Original', { selector: 'p' }));
    expect(screen.getByLabelText('Recipe name')).toHaveProperty('value', 'Chicken in oil');
    expect(screen.getByText('Save original recipe')).toBeTruthy();
  });
});
