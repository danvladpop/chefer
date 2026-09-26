// @vitest-environment jsdom
import EditRecipePage from '@/app/(dashboard)/recipes/[id]/edit/page';
import NewRecipePage from '@/app/(dashboard)/recipes/new/page';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Audit F-X-5-1 / F-REC-3-7: every recipe form control has an accessible
// name; a failed submit links, announces and focuses the first error; editing
// a field clears its stale error.

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
        useQuery: () => ({ data: RECIPE, isLoading: false, error: null }),
      },
      update: {
        useMutation: () => ({ mutate: updateMutate, isPending: false, error: null }),
      },
    },
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
    expect(screen.getByLabelText('Recipe Name')).toBeTruthy();
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

  it('opts out of native validation so the custom errors own the messages', () => {
    render(<NewRecipePage />);
    expect(form().noValidate).toBe(true);
  });

  it('on an empty submit: links + announces the errors and focuses the first invalid field', async () => {
    render(<NewRecipePage />);
    submit();

    expect(createMutate).not.toHaveBeenCalled();
    const name = screen.getByLabelText('Recipe Name');
    await waitFor(() => expect(document.activeElement).toBe(name));
    expect(name.getAttribute('aria-invalid')).toBe('true');
    expect(describedByText(name)).toBe('Recipe name is required.');
    expect(describedByText(screen.getByRole('group', { name: 'Cuisine' }))).toMatch(
      /pick a cuisine/i,
    );
    expect(describedByText(screen.getByLabelText('Step 1'))).toMatch(/instruction step/i);
    expect(screen.getByRole('alert').textContent).toMatch(/recipe not saved/i);
  });

  it('focuses the first invalid field further down (the audit’s −2 prep time)', async () => {
    render(<NewRecipePage />);
    fireEvent.change(screen.getByLabelText('Recipe Name'), { target: { value: 'Soup' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Warm.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Italian' }));
    fireEvent.change(screen.getByLabelText('Prep (min)'), { target: { value: '-2' } });
    submit();

    const prep = screen.getByLabelText('Prep (min)');
    await waitFor(() => expect(document.activeElement).toBe(prep));
    expect(prep.getAttribute('aria-invalid')).toBe('true');
    expect(describedByText(prep)).toMatch(/0 or more/);
    expect(screen.getByLabelText('Recipe Name').getAttribute('aria-invalid')).toBeNull();
  });

  it('clears a stale error as soon as that field changes', () => {
    render(<NewRecipePage />);
    submit();
    const name = screen.getByLabelText('Recipe Name');
    expect(screen.queryByText('Recipe name is required.')).toBeTruthy();

    fireEvent.change(name, { target: { value: 'Soup' } });
    expect(screen.queryByText('Recipe name is required.')).toBeNull();
    expect(name.getAttribute('aria-invalid')).toBeNull();
    expect(name.getAttribute('aria-describedby')).toBeNull();
    // Other errors stay until their own field is fixed.
    expect(screen.queryByText('Description is required.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Thai' }));
    expect(screen.queryByText(/pick a cuisine/i)).toBeNull();
    expect(screen.getByRole('button', { name: 'Thai' }).getAttribute('aria-pressed')).toBe('true');
  });
});

describe('EditRecipePage accessibility', () => {
  it('names every control and the back link', () => {
    render(<EditRecipePage />);
    expect(screen.getByLabelText('Recipe Name')).toHaveProperty('value', 'Pesto Pasta');
    expect(screen.getByLabelText('Cuisine Type')).toBeTruthy();
    expect(screen.getByLabelText('Dietary Tags (comma-separated)')).toBeTruthy();
    expect(screen.getByLabelText('Image URL (optional)')).toBeTruthy();
    expect(screen.getByLabelText('Fiber (g)')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to my recipes' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove step 2' })).toBeTruthy();
    expect(unnamedControls()).toEqual([]);
  });

  it('focuses the calories field when it is cleared, then clears the error on input', async () => {
    render(<EditRecipePage />);
    const calories = screen.getByLabelText('Calories (kcal)');
    fireEvent.change(calories, { target: { value: '' } });
    submit();

    expect(updateMutate).not.toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(calories));
    expect(calories.getAttribute('aria-invalid')).toBe('true');
    expect(describedByText(calories)).toMatch(/enter calories/i);

    fireEvent.change(calories, { target: { value: '480' } });
    expect(calories.getAttribute('aria-invalid')).toBeNull();
    expect(screen.queryByRole('alert')?.textContent ?? '').toBe('');
  });

  it('submits a valid recipe (calories rounded to the API’s integer)', () => {
    render(<EditRecipePage />);
    submit();
    expect(updateMutate).toHaveBeenCalledTimes(1);
    expect(updateMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        recipeId: 'r1',
        nutritionInfo: expect.objectContaining({ calories: 520 }) as unknown,
        ingredients: [{ name: 'basil', quantity: 30, unit: 'g' }],
      }),
    );
  });
});
