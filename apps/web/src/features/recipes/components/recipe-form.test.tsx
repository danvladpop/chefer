// @vitest-environment jsdom
import EditRecipePage from '@/app/(dashboard)/recipes/[id]/edit/page';
import NewRecipePage from '@/app/(dashboard)/recipes/new/page';
import { uploadImage } from '@/lib/upload-image';
import { catalogState } from '@/test-support/catalog-trpc';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Audit F-X-5-1 / F-REC-3-7 (a11y) + T-40.6 (UX-40 slice 1, D-19): only the
// name and >= 1 ingredient are required now; cuisine, description, steps,
// times and nutrition are all optional, and there is no fiber field
// anywhere. A failed submit still links, announces and focuses the first
// error; editing a field still clears its stale error.
//
// plan-ingredient-catalog §10: every line is picked from the catalog and
// stores its ingredientId; nutrition is previewed live with the shared engine
// and computed by the server on save (no typed numbers on web any more).

const { createMutate, updateMutate, recipeState } = vi.hoisted(() => {
  const state: { current: unknown } = { current: null };
  return {
    createMutate: vi.fn((_input: Record<string, unknown>) => undefined),
    updateMutate: vi.fn((_input: Record<string, unknown>) => undefined),
    recipeState: state,
  };
});

const RECIPE = {
  id: 'r1',
  name: 'Pesto Pasta',
  description: 'Green and quick.',
  cuisineType: 'Italian',
  prepTimeMins: 10,
  cookTimeMins: 12,
  servings: 2,
  imageUrl: null,
  dietaryTags: ['vegetarian'],
  ingredients: [{ name: 'basil', quantity: 30, unit: 'g' }],
  instructions: ['Blend the basil.', 'Toss with pasta.'],
  nutritionInfo: { calories: 520.4, protein: 14, carbs: 60, fat: 22, fiber: 4 },
  nutritionStatus: 'COMPUTED' as const,
  lines: [
    {
      position: 0,
      ingredientId: 'basil' as string | null,
      rawName: 'basil',
      quantity: 30,
      unit: 'g',
      grams: 30 as number | null,
      note: null,
      optional: false,
    },
  ],
};

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({ id: 'r1' }),
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@/lib/upload-image', () => ({ uploadImage: vi.fn() }));
vi.mock('@/lib/trpc', async () => {
  const { catalogIngredientsMock, catalogUtilsMock } = await import('@/test-support/catalog-trpc');
  return {
    trpc: {
      ingredients: catalogIngredientsMock(),
      recipe: {
        aiImageUrl: { useQuery: () => ({ refetch: vi.fn(), isFetching: false }) },
        create: {
          useMutation: () => ({ mutate: createMutate, isPending: false, error: null }),
        },
        getMyRecipe: {
          useQuery: () => ({
            data: recipeState.current ?? RECIPE,
            isLoading: false,
            error: null,
            isFetchedAfterMount: true,
            isFetching: false,
            refetch: vi.fn(),
          }),
        },
        update: {
          useMutation: () => ({ mutate: updateMutate, isPending: false, error: null }),
        },
      },
      // T-BUG-O3 C1: EditRecipePage invalidates recipe.getMyRecipe/list +
      // mealPlan.getRecipe on a successful update.
      useUtils: () => ({
        ...catalogUtilsMock(),
        recipe: { getMyRecipe: { invalidate: vi.fn() }, list: { invalidate: vi.fn() } },
        mealPlan: { getRecipe: { invalidate: vi.fn() } },
      }),
    },
  };
});

// jsdom has no scrollTo; the Sheet's scroll lock restores the page offset with it.
vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
afterEach(cleanup);
beforeEach(() => {
  createMutate.mockClear();
  updateMutate.mockClear();
  recipeState.current = null;
  catalogState.resolve.clear();
});

/** Opens the picker for a line and picks the first search result for `query`. */
async function pickIngredient(line: number, query: string, result: RegExp) {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^Ingredient ${line}:`) }));
  const dialog = await screen.findByRole('dialog', { name: 'Choose an ingredient' });
  fireEvent.change(within(dialog).getByLabelText('Search ingredients'), {
    target: { value: query },
  });
  fireEvent.click(await within(dialog).findByRole('button', { name: result }));
  await waitFor(() =>
    expect(screen.queryByRole('dialog', { name: 'Choose an ingredient' })).toBeNull(),
  );
}

/** Mirrors axe's `label` rule: every form control needs a programmatic name. */
function unnamedControls(): string[] {
  const controls = document.querySelectorAll<HTMLInputElement>('input, textarea, select');
  return Array.from(controls)
    .filter(
      (el) =>
        (el.labels?.length ?? 0) === 0 &&
        !el.getAttribute('aria-label') &&
        !el.getAttribute('aria-labelledby'),
    )
    .map((el) => el.outerHTML);
}

function describedByText(el: HTMLElement): string {
  const ids = el.getAttribute('aria-describedby')?.split(' ') ?? [];
  return ids.map((id) => document.getElementById(id)?.textContent ?? '').join(' ');
}

function form(): HTMLFormElement {
  const el = document.querySelector('form');
  if (!el) throw new Error('form not rendered');
  return el;
}

function submit() {
  fireEvent.submit(form());
}

describe('NewRecipePage accessibility', () => {
  it('names every control, the back link and the step/ingredient remove buttons', () => {
    render(<NewRecipePage />);
    expect(screen.getByLabelText(/Recipe Name/)).toBeTruthy();
    expect(screen.getByLabelText('Description')).toBeTruthy();
    expect(screen.getByLabelText('Prep (min)')).toBeTruthy();
    expect(screen.getByLabelText('Cook (min)')).toBeTruthy();
    expect(screen.getByLabelText('Servings')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ingredient 1: not chosen' })).toBeTruthy();
    expect(screen.getByLabelText('Amount for ingredient 1')).toBeTruthy();
    expect(screen.getByLabelText('Unit for ingredient 1')).toBeTruthy();
    expect(screen.getByLabelText('Step 1')).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Cuisine' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to recipes' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /add step/i }));
    fireEvent.click(screen.getByRole('button', { name: /add ingredient/i }));
    expect(screen.getByRole('button', { name: 'Remove step 2' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove ingredient 2' })).toBeTruthy();
    expect(unnamedControls()).toEqual([]);
  });

  it('shows the "* Required" legend once and marks Name/Ingredients with a *', () => {
    render(<NewRecipePage />);
    expect(screen.getByText('* Required')).toBeTruthy();
    expect(screen.getByText('Ingredients *')).toBeTruthy();
  });

  it('opts out of native validation so the custom errors own the messages', () => {
    render(<NewRecipePage />);
    expect(form().noValidate).toBe(true);
  });

  it('never renders a fiber input or stat (D-18), and has no typed-macros path any more', () => {
    render(<NewRecipePage />);
    expect(screen.queryByText(/fiber/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /enter manually/i })).toBeNull();
    expect(screen.queryByLabelText(/calories/i)).toBeNull();
  });

  it('D-19: on an empty submit, only the name is required — cuisine and steps are not', async () => {
    render(<NewRecipePage />);
    submit();

    expect(createMutate).not.toHaveBeenCalled();
    const name = screen.getByLabelText(/Recipe Name/);
    await waitFor(() => expect(document.activeElement).toBe(name));
    expect(name.getAttribute('aria-invalid')).toBe('true');
    expect(describedByText(name)).toBe('Recipe name is required.');
    // Cuisine and steps are optional now — no error is reported for either.
    expect(describedByText(screen.getByRole('group', { name: 'Cuisine' }))).toBe('');
    expect(describedByText(screen.getByLabelText('Step 1'))).toBe('');
    expect(screen.getByRole('alert').textContent).toMatch(/recipe not saved/i);
  });

  it('picks a catalog ingredient, limits its units, previews nutrition and saves its id', async () => {
    render(<NewRecipePage />);
    fireEvent.change(screen.getByLabelText(/Recipe Name/), { target: { value: 'Chicken' } });
    await pickIngredient(1, 'chick', /Chicken breast, raw/);

    expect(screen.getByRole('button', { name: 'Ingredient 1: Chicken breast, raw' })).toBeTruthy();
    // grams, the row's own portion, never a volume unit without a density (I6)
    const units = Array.from(
      screen.getByLabelText<HTMLSelectElement>('Unit for ingredient 1').options,
    ).map((o) => o.value);
    expect(units).toContain('breast');
    expect(units).not.toContain('cup');

    fireEvent.change(screen.getByLabelText('Amount for ingredient 1'), {
      target: { value: '200' },
    });
    // 200 g × 120 kcal/100 g, 1 serving — the shared engine, in the browser.
    const preview = screen.getByTestId('nutrition-preview');
    await waitFor(() => expect(within(preview).getByText(/^240$/)).toBeTruthy());
    expect(
      within(preview).getByText('Nutrition is computed from 1 ingredient, per serving.'),
    ).toBeTruthy();

    submit();
    expect(createMutate).toHaveBeenCalledTimes(1);
    const sent = createMutate.mock.calls[0]?.[0] ?? {};
    expect(sent['ingredients']).toEqual([
      { name: 'Chicken breast, raw', quantity: 200, unit: 'g', ingredientId: 'chicken' },
    ]);
    // The server computes nutrition; the web form never sends typed numbers.
    expect(sent).not.toHaveProperty('nutritionInfo');
  });

  it('says "Incomplete" when a unit cannot be converted for the picked ingredient', async () => {
    render(<NewRecipePage />);
    await pickIngredient(1, 'basil', /Basil, fresh/);
    fireEvent.change(screen.getByLabelText('Amount for ingredient 1'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Unit for ingredient 1'), {
      target: { value: 'pinch' },
    });
    await waitFor(() => expect(screen.getByText(/computed from 1 ingredient/)).toBeTruthy());
    fireEvent.change(screen.getByLabelText('Amount for ingredient 1'), { target: { value: 'x' } });
    // An unparseable amount just leaves the line out of the preview.
    expect(screen.getByText(/Add ingredients with amounts/)).toBeTruthy();
  });

  it('focuses the first invalid field further down (the audit’s −2 prep time)', async () => {
    render(<NewRecipePage />);
    fireEvent.change(screen.getByLabelText(/Recipe Name/), {
      target: { value: 'Soup' },
    });
    fireEvent.change(screen.getByLabelText('Prep (min)'), { target: { value: '-2' } });
    submit();

    const prep = screen.getByLabelText('Prep (min)');
    await waitFor(() => expect(document.activeElement).toBe(prep));
    expect(prep.getAttribute('aria-invalid')).toBe('true');
    expect(describedByText(prep)).toMatch(/0 or more/);
    expect(screen.getByLabelText(/Recipe Name/).getAttribute('aria-invalid')).toBeNull();
  });

  it('clears a stale error as soon as that field changes', () => {
    render(<NewRecipePage />);
    submit();
    const name = screen.getByLabelText(/Recipe Name/);
    expect(screen.queryByText('Recipe name is required.')).toBeTruthy();

    fireEvent.change(name, { target: { value: 'Soup' } });
    expect(screen.queryByText('Recipe name is required.')).toBeNull();
    expect(name.getAttribute('aria-invalid')).toBeNull();
    expect(name.getAttribute('aria-describedby')).toBeNull();
  });
});

describe('NewRecipePage photo upload (T-BUG-O1)', () => {
  // O-18: `uploadImage` used to throw `new Error(data.error)` where `error`
  // could be `{ code, message }`, which rendered as the literal text
  // "[object Object]". uploadImage itself now maps every failure to one of
  // UX-40's four sentences (apps/web/src/lib/upload-image.test.ts covers
  // that mapping) — this checks the page surfaces whatever sentence it
  // throws, verbatim, in the alert.
  it('shows the too-big sentence when the upload rejects with it, never a status code or [object Object]', async () => {
    vi.mocked(uploadImage).mockRejectedValueOnce(
      new Error('That photo is too big. Choose another, or use a screenshot of it.'),
    );
    render(<NewRecipePage />);

    const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });
    const input = screen.getByLabelText(/upload from device/i);
    fireEvent.change(input, { target: { files: [file] } });

    const alert = await screen.findByText(
      'That photo is too big. Choose another, or use a screenshot of it.',
    );
    expect(alert.getAttribute('role')).toBe('alert');
    expect(alert.textContent).not.toContain('[object Object]');
    expect(alert.textContent).not.toMatch(/^\d{3}$|\(\d{3}\)/);
  });
});

describe('EditRecipePage accessibility', () => {
  it('names every control and the back link', () => {
    render(<EditRecipePage />);
    expect(screen.getByLabelText(/Recipe Name/)).toHaveProperty('value', 'Pesto Pasta');
    expect(screen.getByLabelText('Cuisine Type')).toBeTruthy();
    expect(screen.getByLabelText('Dietary Tags (comma-separated)')).toBeTruthy();
    expect(screen.getByLabelText('Image URL (optional)')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to my recipes' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove step 2' })).toBeTruthy();
    expect(unnamedControls()).toEqual([]);
  });

  it('shows the "* Required" legend and never renders a fiber field (D-18)', () => {
    render(<EditRecipePage />);
    expect(screen.getByText('* Required')).toBeTruthy();
    expect(screen.getByText('Ingredients *')).toBeTruthy();
    expect(screen.queryByLabelText(/fiber/i)).toBeNull();
    expect(screen.queryByText(/fiber/i)).toBeNull();
  });

  it('D-19: cuisine is optional — saving without changing anything still works', () => {
    render(<EditRecipePage />);
    submit();
    expect(updateMutate).toHaveBeenCalledTimes(1);
  });

  it('brings stored lines back linked and saves their ids — no typed numbers', () => {
    render(<EditRecipePage />);
    expect(screen.getByRole('button', { name: 'Ingredient 1: Basil, fresh' })).toBeTruthy();
    submit();
    expect(updateMutate).toHaveBeenCalledTimes(1);
    const sent = updateMutate.mock.calls[0]?.[0] ?? {};
    expect(sent).toMatchObject({
      recipeId: 'r1',
      ingredients: [{ name: 'basil', quantity: 30, unit: 'g', ingredientId: 'basil' }],
    });
    expect(sent).not.toHaveProperty('nutritionInfo');
  });

  it('a legacy line without an id shows the resolver’s suggestions until one is picked', async () => {
    recipeState.current = {
      ...RECIPE,
      nutritionStatus: 'USER_ENTERED',
      lines: [{ ...RECIPE.lines[0], ingredientId: null, rawName: 'basil leaves', grams: null }],
    };
    catalogState.resolve.set('basil leaves', {
      confidence: 'CANDIDATES',
      match: null,
      candidates: [
        {
          id: 'basil',
          slug: 'basil',
          name: 'Basil, fresh',
          category: 'HERB_FRESH',
          owner: 'global',
          portions: [{ unit: 'leaf', grams: 0.5 }],
          hasDensity: false,
          nutritionSource: 'USDA_FDC',
        },
      ],
    });
    render(<EditRecipePage />);

    expect(
      screen.getByRole('button', {
        name: 'Ingredient 1: basil leaves, not matched to the catalog',
      }),
    ).toBeTruthy();
    expect(screen.getByText(/Incomplete — 1 ingredient needs data/)).toBeTruthy();
    // USER_ENTERED: saving replaces the typed numbers with computed ones.
    expect(screen.getByText(/numbers you typed in earlier/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Basil, fresh' }));
    await waitFor(() => expect(screen.getByText(/computed from 1 ingredient/)).toBeTruthy());

    submit();
    const sent = updateMutate.mock.calls[0]?.[0] ?? {};
    // The written name stays; the pick adds the id.
    expect(sent['ingredients']).toEqual([
      { name: 'basil leaves', quantity: 30, unit: 'g', ingredientId: 'basil' },
    ]);
  });

  it('an EXACT/ALIAS match on a legacy line is linked, as the server would on save', () => {
    recipeState.current = {
      ...RECIPE,
      lines: [{ ...RECIPE.lines[0], ingredientId: null, rawName: 'olive oil', unit: 'tbsp' }],
    };
    catalogState.resolve.set('olive oil', {
      confidence: 'ALIAS',
      match: {
        id: 'oil',
        slug: 'oil',
        name: 'Olive oil',
        category: 'OIL_FAT',
        owner: 'global',
        portions: [],
        hasDensity: true,
        nutritionSource: 'USDA_FDC',
      },
      candidates: [],
    });
    render(<EditRecipePage />);
    expect(screen.getByRole('button', { name: 'Ingredient 1: Olive oil' })).toBeTruthy();
    expect(screen.queryByText(/Pick a match/)).toBeNull();
  });

  it('clearing the name still blocks the save and focuses it', async () => {
    render(<EditRecipePage />);
    const name = screen.getByLabelText(/Recipe Name/);
    fireEvent.change(name, { target: { value: '' } });
    submit();

    expect(updateMutate).not.toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(name));
    expect(name.getAttribute('aria-invalid')).toBe('true');
  });
});
