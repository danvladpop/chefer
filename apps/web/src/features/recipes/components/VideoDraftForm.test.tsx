// @vitest-environment jsdom
import { catalogRef } from '@/test-support/catalog-trpc';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VideoDraftForm, type VideoImportPreviewData } from './VideoDraftForm';

// The private-ingredient sheet's image upload (env-dependent); unused here.
vi.mock('@/lib/upload-image', () => ({ uploadImage: vi.fn() }));
vi.mock('@/lib/trpc', async () => {
  const { catalogIngredientsMock, catalogUtilsMock } = await import('@/test-support/catalog-trpc');
  return { trpc: { ingredients: catalogIngredientsMock(), useUtils: () => catalogUtilsMock() } };
});

// jsdom has no scrollTo; the Sheet's scroll lock restores the page offset with it.
vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
afterEach(cleanup);

type Resolution = VideoImportPreviewData['resolution'][number];
const matched = (rawName: string, unit: string, id: string): Resolution => ({
  rawName,
  unit,
  note: null,
  confidence: 'ALIAS',
  match: catalogRef(id),
  candidates: [],
  grams: null,
});

function preview(overrides: Partial<VideoImportPreviewData> = {}): VideoImportPreviewData {
  return {
    via: 'video',
    draft: {
      name: 'Garlic Noodles',
      description: 'Buttery garlic noodles.',
      ingredients: [
        { name: 'noodles', quantity: 200, unit: 'g' },
        { name: 'olive oil', quantity: 3, unit: 'tbsp' },
      ],
      instructions: ['Boil the noodles.'],
      nutritionInfo: { calories: 600, protein: 20, carbs: 90, fat: 18, fiber: 4 },
      cuisineType: 'Asian',
      dietaryTags: [],
      prepTimeMins: 5,
      cookTimeMins: 10,
      servings: 2,
    },
    notFound: [],
    unverifiedQuantities: [],
    assumptions: [],
    transcriptSource: 'speech',
    safety: { ok: true, issues: [] },
    platform: 'youtube',
    sourceUrl: 'https://www.youtube.com/watch?v=abcdef123',
    ogImageUrl: null,
    videoTitle: 'Garlic noodles',
    creator: 'chef',
    // plan-ingredient-catalog §6.2: the server's catalog match per line.
    resolution: [matched('noodles', 'g', 'noodles'), matched('olive oil', 'tbsp', 'oil')],
    nutritionStatus: 'COMPUTED',
    ...overrides,
  };
}

function renderForm(data = preview()) {
  const onSave = vi.fn();
  render(
    <VideoDraftForm
      preview={data}
      saving={false}
      saveError={null}
      onBack={vi.fn()}
      onSave={onSave}
    />,
  );
  return { onSave };
}

describe('VideoDraftForm', () => {
  it('says where the recipe was read from and asks the user to check it', () => {
    renderForm();
    expect(screen.getByText('Check the details')).toBeTruthy();
    expect(screen.getByText(/what's said in the video/)).toBeTruthy();
  });

  it('pre-fills every field and saves the reviewed recipe', () => {
    const { onSave } = renderForm();
    expect(screen.getByLabelText<HTMLInputElement>('Recipe name').value).toBe('Garlic Noodles');
    expect(screen.getByLabelText<HTMLInputElement>('Amount for ingredient 1').value).toBe('200');
    fireEvent.change(screen.getByLabelText('Recipe name'), {
      target: { value: 'Garlic Butter Noodles' },
    });
    fireEvent.change(screen.getByLabelText('Amount for ingredient 2'), {
      target: { value: '1/2' },
    });
    fireEvent.change(screen.getByLabelText('Unit for ingredient 2'), { target: { value: 'cup' } });
    fireEvent.click(screen.getByText('Save recipe'));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Garlic Butter Noodles',
        // the catalog ids picked by the server's match ride along
        ingredients: [
          { name: 'noodles', quantity: 200, unit: 'g', ingredientId: 'noodles' },
          { name: 'olive oil', quantity: 0.5, unit: 'cup', ingredientId: 'oil' },
        ],
      }),
      { acceptPartial: false },
    );
  });

  it('marks what the video did not say, and blocks saving until it is filled', () => {
    const { onSave } = renderForm(
      preview({
        draft: { ...preview().draft, name: '', instructions: [] },
        notFound: ['name', 'instructions', 'servings', 'time'],
      }),
    );
    expect(screen.getAllByText('Not found — please add')).toHaveLength(2);
    expect(screen.getByText(/Servings: not stated in the video/)).toBeTruthy();
    expect(screen.getByText(/Time: not stated in the video/)).toBeTruthy();

    fireEvent.click(screen.getByText('Save recipe'));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Add a recipe name.')).toBeTruthy();
    expect(screen.getByText('Add at least one step.')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Recipe name'), { target: { value: 'Noodles' } });
    fireEvent.change(screen.getByLabelText('Step 1'), { target: { value: 'Boil them.' } });
    fireEvent.change(screen.getByLabelText('Servings'), { target: { value: '4' } });
    expect(screen.queryByText('Not found — please add')).toBeNull();
    expect(screen.queryByText(/Servings: not stated/)).toBeNull();

    fireEvent.click(screen.getByText('Save recipe'));
    // Per-serving nutrition follows the new serving count (2 → 4).
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Noodles',
        instructions: ['Boil them.'],
        servings: 4,
        nutritionInfo: { calories: 300, protein: 10, carbs: 45, fat: 9, fiber: 2 },
      }),
      { acceptPartial: false },
    );
  });

  it('an unmatched line blocks the save until it is matched or incomplete nutrition is accepted', async () => {
    const { onSave } = renderForm(
      preview({
        resolution: [
          matched('noodles', 'g', 'noodles'),
          {
            rawName: 'olive oil',
            unit: 'tbsp',
            note: null,
            confidence: 'CANDIDATES',
            match: null,
            candidates: [catalogRef('oil')],
            grams: null,
            problem: 'NO_INGREDIENT',
          },
        ],
      }),
    );
    expect(screen.getByText(/Incomplete — 1 ingredient needs data/)).toBeTruthy();
    fireEvent.click(screen.getByText('Save recipe'));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText(/1 ingredient needs a match/)).toBeTruthy();

    // Accepting incomplete nutrition is explicit…
    fireEvent.click(screen.getByLabelText('Save with incomplete nutrition'));
    fireEvent.click(screen.getByText('Save recipe'));
    expect(onSave).toHaveBeenLastCalledWith(expect.anything(), { acceptPartial: true });

    // …or the user picks the suggested match, and the line computes.
    fireEvent.click(screen.getByRole('button', { name: 'Olive oil' }));
    await waitFor(() => expect(screen.getByText(/computed from 2 ingredients/)).toBeTruthy());
    expect(screen.queryByLabelText('Save with incomplete nutrition')).toBeNull();
  });

  it('flags amounts nobody said, and the flag follows its row', () => {
    renderForm(preview({ unverifiedQuantities: [1] }));
    expect(screen.getAllByText('Amount not heard — please check')).toHaveLength(1);
    fireEvent.click(screen.getByLabelText('Remove ingredient 1'));
    // "olive oil" is now row 1 and still flagged.
    expect(screen.getByRole('button', { name: 'Ingredient 1: Olive oil' })).toBeTruthy();
    expect(screen.getAllByText('Amount not heard — please check')).toHaveLength(1);
    fireEvent.change(screen.getByLabelText('Amount for ingredient 1'), { target: { value: '2' } });
    expect(screen.queryByText('Amount not heard — please check')).toBeNull();
  });

  it('adds ingredient and step rows', () => {
    renderForm();
    fireEvent.click(screen.getByText('Add ingredient'));
    fireEvent.click(screen.getByText('Add step'));
    expect(screen.getByRole('button', { name: 'Ingredient 3: not chosen' })).toBeTruthy();
    expect(screen.getByLabelText('Step 2')).toBeTruthy();
  });

  it('warns about household allergens', () => {
    renderForm(preview({ safety: { ok: false, issues: ['peanut'] } }));
    expect(screen.getByText(/conflicts with your household/)).toBeTruthy();
  });
});
