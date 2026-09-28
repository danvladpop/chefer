// @vitest-environment jsdom
import EditRecipePage from '@/app/(dashboard)/recipes/[id]/edit/page';
import NewRecipePage from '@/app/(dashboard)/recipes/new/page';
import { uploadImage } from '@/lib/upload-image';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Audit F-X-5-1 / F-REC-3-7 (a11y) + T-40.6 (UX-40 slice 1, D-19): only the
// name and >= 1 ingredient are required now; cuisine, description, steps,
// times and nutrition are all optional, and there is no fiber field
// anywhere. A failed submit still links, announces and focuses the first
// error; editing a field still clears its stale error.

const createMutate = vi.fn();
const updateMutate = vi.fn();

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
vi.mock('@/features/ingredients/components/IngredientFormModal', () => ({
  IngredientFormModal: () => null,
}));
vi.mock('@/lib/trpc', () => ({
  trpc: {
    ingredients: {
      units: { useQuery: () => ({ data: ['g', 'ml', 'piece'] }) },
      computeNutrition: { useQuery: () => ({ data: undefined, isFetching: false }) },
      search: { useQuery: () => ({ data: [], isFetching: false }) },
    },
    recipe: {
      aiImageUrl: { useQuery: () => ({ refetch: vi.fn(), isFetching: false }) },
      create: {
        useMutation: () => ({ mutate: createMutate, isPending: false, error: null }),
      },
      getMyRecipe: {
        useQuery: () => ({
          data: RECIPE,
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
      recipe: { getMyRecipe: { invalidate: vi.fn() }, list: { invalidate: vi.fn() } },
      mealPlan: { getRecipe: { invalidate: vi.fn() } },
    }),
  },
}));

afterEach(cleanup);
beforeEach(() => {
  createMutate.mockClear();
  updateMutate.mockClear();
});

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
    expect(screen.getByLabelText('Name for ingredient 1')).toBeTruthy();
    expect(screen.getByLabelText('Quantity for ingredient 1')).toBeTruthy();
    expect(screen.getByLabelText('Step 1')).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Cuisine' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to recipes' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /add step/i }));
    fireEvent.click(screen.getByRole('button', { name: /add ingredient/i }));
    expect(screen.getByRole('button', { name: 'Remove step 2' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove ingredient 2' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /enter manually instead/i }));
    expect(screen.getByLabelText('Calories (kcal)')).toBeTruthy();
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

  it('never renders a fiber input or stat (D-18)', () => {
    render(<NewRecipePage />);
    expect(screen.queryByText(/fiber/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /enter manually instead/i }));
    expect(screen.queryByLabelText(/fiber/i)).toBeNull();
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

  // The "name + one ingredient line saves" round trip through the real
  // IngredientPicker (search/create-custom) is covered end-to-end by
  // tests/e2e/recipe-form.spec.ts (Playwright) rather than here — typing a
  // free-text ingredient name only commits through a picked suggestion or
  // the custom-ingredient modal, both of which need a live search backend.

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

  it('D-19: cuisine and calories are optional — saving without changing them still works', () => {
    render(<EditRecipePage />);
    submit();
    expect(updateMutate).toHaveBeenCalledTimes(1);
  });

  it('submits a valid recipe and keeps the stored fiber (calories rounded to the API’s integer)', () => {
    render(<EditRecipePage />);
    submit();
    expect(updateMutate).toHaveBeenCalledTimes(1);
    expect(updateMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        recipeId: 'r1',
        nutritionInfo: expect.objectContaining({ calories: 520, fiber: 4 }) as unknown,
        ingredients: [{ name: 'basil', quantity: 30, unit: 'g' }],
      }),
    );
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
