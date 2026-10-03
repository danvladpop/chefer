'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useId, useState } from 'react';
import { NutritionPreview } from '@/features/recipes/components/NutritionPreview';
import {
  Field,
  FormErrorSummary,
  inputCls,
  RequiredLegend,
  Section,
} from '@/features/recipes/components/recipe-form-fields';
import {
  firstIncompleteField,
  lineFieldId,
  RecipeLinesEditor,
} from '@/features/recipes/components/RecipeLinesEditor';
import { useLiveNutrition } from '@/features/recipes/hooks/useLiveNutrition';
import { useRecipeFormLines } from '@/features/recipes/hooks/useRecipeFormLines';
import {
  errorIdFor,
  fieldErrorProps,
  useRecipeFormErrors,
  validateRecipeCore,
  type RecipeFormErrors,
  type RecipeFormFocusTargets,
} from '@/features/recipes/lib/recipe-form';
import { newLineRow, toSaveLines, type LineRow } from '@/features/recipes/lib/recipe-lines';
import { trpc } from '@/lib/trpc';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { userFacingErrorMessage } from '@chefer/utils';

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EditRecipePage() {
  const params = useParams<{ id: string }>();
  const recipeId = params.id;
  const router = useRouter();

  // Stable ids for <label htmlFor> / aria-describedby (F-X-5-1, F-REC-3-7).
  const uid = useId();
  const ids = {
    name: `${uid}-name`,
    description: `${uid}-description`,
    cuisineType: `${uid}-cuisine`,
    dietaryTags: `${uid}-dietary-tags`,
    prepTimeMins: `${uid}-prep`,
    cookTimeMins: `${uid}-cook`,
    servings: `${uid}-servings`,
    imageUrl: `${uid}-image-url`,
    ingredients: `${uid}-ingredients`,
    instructions: `${uid}-instructions`,
  };
  const stepId = (i: number) => `${uid}-step-${i}`;

  const utils = trpc.useUtils();

  // T-BUG-O3 C1 (O-15): refetch on every mount and prefill only once that
  // fetch has landed — the old `hydrated`-only guard kept prefilling from a
  // stale cached copy when Edit was reopened right after a save, so a
  // second save reverted the first edit.
  const {
    data: recipe,
    isLoading,
    error: loadError,
    isFetchedAfterMount,
    isFetching,
    refetch: refetchRecipe,
  } = trpc.recipe.getMyRecipe.useQuery({ recipeId }, { retry: false, refetchOnMount: 'always' });

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [cuisineType, setCuisineType] = useState('');
  const [prepTimeMins, setPrepTimeMins] = useState('');
  const [cookTimeMins, setCookTimeMins] = useState('');
  const [servings, setServings] = useState('1');
  const [imageUrl, setImageUrl] = useState('');
  const [dietaryTags, setDietaryTags] = useState('');
  const [lines, setLines] = useState<LineRow[]>(() => [newLineRow()]);
  const [linesHydrated, setLinesHydrated] = useState(false);
  const [instructions, setInstructions] = useState<string[]>(['']);
  const [hydrated, setHydrated] = useState(false);
  const { errors, clear: clearError, report: reportErrors } = useRecipeFormErrors();

  // Pre-fill form when recipe loads
  useEffect(() => {
    if (!recipe || hydrated || !isFetchedAfterMount || isFetching) return;
    setName(recipe.name);
    setDescription(recipe.description);
    setCuisineType(recipe.cuisineType);
    setPrepTimeMins(String(recipe.prepTimeMins));
    setCookTimeMins(String(recipe.cookTimeMins));
    setServings(String(recipe.servings));
    setImageUrl(recipe.imageUrl ?? '');
    setDietaryTags(recipe.dietaryTags.join(', '));

    setInstructions(recipe.instructions.length > 0 ? recipe.instructions : ['']);
    setHydrated(true);
  }, [recipe, hydrated, isFetchedAfterMount, isFetching]);

  // The recipe's lines, linked to the catalog (shared with Duplicate).
  const hydratedRows = useRecipeFormLines(recipe, isFetchedAfterMount && !isFetching);
  useEffect(() => {
    if (linesHydrated || !hydratedRows) return;
    setLines(hydratedRows);
    setLinesHydrated(true);
  }, [linesHydrated, hydratedRows]);

  const servingsNum = Math.max(1, Number(servings) || 1);
  const live = useLiveNutrition(lines, servingsNum);

  const updateMutation = trpc.recipe.update.useMutation({
    meta: { silent: true },
    onSuccess: () => {
      // T-BUG-O3 C1: invalidate every query this recipe could be read
      // through — a stale cache in any of these reverted the previous edit.
      void utils.recipe.getMyRecipe.invalidate({ recipeId });
      void utils.recipe.list.invalidate();
      void utils.mealPlan.getRecipe.invalidate({ recipeId });
      router.push('/recipes?tab=my');
    },
  });

  // ─── Helpers ────────────────────────────────────────────────────────────────

  const updateLines = (next: LineRow[]) => {
    clearError('ingredients');
    setLines(next);
  };

  const addInstruction = () => setInstructions((prev) => [...prev, '']);

  const removeInstruction = (i: number) =>
    setInstructions((prev) => prev.filter((_, idx) => idx !== i));

  const updateInstruction = (i: number, value: string) => {
    clearError('instructions');
    setInstructions((prev) => prev.map((ins, idx) => (idx === i ? value : ins)));
  };

  // ─── Validation & Submit ────────────────────────────────────────────────────

  // T-40.6 (D-19): only the name and >= 1 ingredient are required — cuisine
  // and nutrition are both optional now, on both platforms.
  const validate = (): boolean => {
    const errs: RecipeFormErrors = validateRecipeCore({
      name,
      description,
      prepTimeMins,
      cookTimeMins,
      servings,
      instructions,
    });
    if (toSaveLines(lines).length === 0) {
      errs.ingredients = 'Add at least one ingredient with an amount.';
    }

    // Focus lands on the first incomplete ingredient row's first missing field.
    const bad = firstIncompleteField(lines);
    const targets: RecipeFormFocusTargets = {
      name: ids.name,
      description: ids.description,
      prepTimeMins: ids.prepTimeMins,
      cookTimeMins: ids.cookTimeMins,
      servings: ids.servings,
      ingredients: lineFieldId(uid, bad.index, bad.field),
      instructions: stepId(0),
    };
    return reportErrors(errs, targets);
  };

  const handleSubmit = (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const validInstructions = instructions.filter((s) => s.trim()).map((s) => s.trim());

    const tags = dietaryTags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    updateMutation.mutate({
      recipeId,
      name: name.trim(),
      description: description.trim(),
      cuisineType: cuisineType.trim(),
      prepTimeMins: Number(prepTimeMins),
      cookTimeMins: Number(cookTimeMins),
      servings: Number(servings),
      imageUrl: imageUrl.trim() || undefined,
      dietaryTags: tags,
      // Lines carry their ingredientId (unmatched ones only their text); the
      // server recomputes nutrition from them — no typed numbers (plan §6.2).
      ingredients: toSaveLines(lines),
      instructions: validInstructions,
    });
  };

  // ─── Loading / Error states ──────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 rounded bg-gray-100" />
          <div className="h-64 rounded-2xl bg-gray-100" />
        </div>
      </div>
    );
  }

  if (loadError || !recipe) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8 text-center">
        <p className="text-gray-500">
          Recipe not found or you don&apos;t have permission to edit it.
        </p>
        <div className="mt-4 flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={() => void refetchRecipe()}
            className="inline-flex min-h-11 items-center text-sm text-[#944a00] hover:underline"
          >
            Try again
          </button>
          <Link
            href="/recipes?tab=my"
            className="inline-flex min-h-11 items-center text-sm text-[#944a00] hover:underline"
          >
            ← Back to My Recipes
          </Link>
        </div>
      </div>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/recipes?tab=my"
          aria-label="Back to my recipes"
          className="touch-target relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border bg-white text-gray-500 shadow-sm transition-colors hover:text-gray-800"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </Link>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">
            My Recipes
          </p>
          <h1 className="font-serif text-2xl font-bold text-gray-900">Edit Recipe</h1>
        </div>
      </div>
      <RequiredLegend />

      {/* noValidate: our own validation owns the messages (F-REC-3-7). */}
      <form onSubmit={handleSubmit} noValidate className="space-y-8">
        {/* ── Basic Info ─────────────────────────────────────────────── */}
        <Section title="Basic Info">
          <Field id={ids.name} label="Recipe Name" required error={errors.name}>
            <input
              id={ids.name}
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                clearError('name');
              }}
              aria-required="true"
              {...fieldErrorProps(ids.name, errors.name)}
              className={inputCls(!!errors.name)}
            />
          </Field>

          <Field id={ids.description} label="Description" error={errors.description}>
            <textarea
              id={ids.description}
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                clearError('description');
              }}
              rows={3}
              {...fieldErrorProps(ids.description, errors.description)}
              className={inputCls(!!errors.description)}
            />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field id={ids.cuisineType} label="Cuisine Type" error={errors.cuisineType}>
              <input
                id={ids.cuisineType}
                type="text"
                value={cuisineType}
                onChange={(e) => {
                  setCuisineType(e.target.value);
                  clearError('cuisineType');
                }}
                {...fieldErrorProps(ids.cuisineType, errors.cuisineType)}
                className={inputCls(!!errors.cuisineType)}
              />
            </Field>
            <Field id={ids.dietaryTags} label="Dietary Tags (comma-separated)">
              <input
                id={ids.dietaryTags}
                type="text"
                value={dietaryTags}
                onChange={(e) => setDietaryTags(e.target.value)}
                className={inputCls(false)}
              />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Field id={ids.prepTimeMins} label="Prep (min)" error={errors.prepTimeMins}>
              <input
                id={ids.prepTimeMins}
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                value={prepTimeMins}
                onChange={(e) => {
                  setPrepTimeMins(e.target.value);
                  clearError('prepTimeMins');
                }}
                {...fieldErrorProps(ids.prepTimeMins, errors.prepTimeMins)}
                className={inputCls(!!errors.prepTimeMins)}
              />
            </Field>
            <Field id={ids.cookTimeMins} label="Cook (min)" error={errors.cookTimeMins}>
              <input
                id={ids.cookTimeMins}
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                value={cookTimeMins}
                onChange={(e) => {
                  setCookTimeMins(e.target.value);
                  clearError('cookTimeMins');
                }}
                {...fieldErrorProps(ids.cookTimeMins, errors.cookTimeMins)}
                className={inputCls(!!errors.cookTimeMins)}
              />
            </Field>
            <Field id={ids.servings} label="Servings" error={errors.servings}>
              <input
                id={ids.servings}
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                value={servings}
                onChange={(e) => {
                  setServings(e.target.value);
                  clearError('servings');
                }}
                {...fieldErrorProps(ids.servings, errors.servings)}
                className={inputCls(!!errors.servings)}
              />
            </Field>
          </div>

          <Field id={ids.imageUrl} label="Image URL (optional)">
            <input
              id={ids.imageUrl}
              type="url"
              inputMode="url"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://…"
              className={inputCls(false)}
            />
          </Field>
        </Section>

        {/* ── Ingredients ────────────────────────────────────────────── */}
        <Section
          title="Ingredients *"
          error={errors.ingredients}
          errorId={errorIdFor(ids.ingredients)}
        >
          {linesHydrated ? (
            <RecipeLinesEditor
              rows={lines}
              onChange={updateLines}
              problems={live.problems}
              idPrefix={uid}
              error={errors.ingredients}
              errorId={errorIdFor(ids.ingredients)}
            />
          ) : (
            <div className="space-y-2" aria-busy="true" aria-label="Loading ingredients">
              <div className="h-11 animate-pulse rounded-xl bg-gray-100" />
              <div className="h-11 animate-pulse rounded-xl bg-gray-100" />
            </div>
          )}
        </Section>

        {/* ── Instructions ───────────────────────────────────────────── */}
        <Section
          title="Instructions"
          error={errors.instructions}
          errorId={errorIdFor(ids.instructions)}
        >
          <div className="space-y-2">
            {instructions.map((step, i) => (
              <div key={i} className="flex items-start gap-2">
                <span
                  aria-hidden="true"
                  className="mt-2.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#fff3e8] text-xs font-bold text-[#944a00]"
                >
                  {i + 1}
                </span>
                <textarea
                  id={stepId(i)}
                  value={step}
                  onChange={(e) => updateInstruction(i, e.target.value)}
                  rows={2}
                  placeholder={`Step ${i + 1}…`}
                  aria-label={`Step ${i + 1}`}
                  {...fieldErrorProps(ids.instructions, errors.instructions)}
                  className={`min-w-0 flex-1 ${inputCls(!!errors.instructions)}`}
                />
                {instructions.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeInstruction(i)}
                    aria-label={`Remove step ${i + 1}`}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-red-50 hover:text-red-500"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addInstruction}
            className="mt-1 flex min-h-11 items-center gap-1.5 text-sm font-medium text-[#944a00] hover:underline"
          >
            <Plus className="h-4 w-4" />
            Add Step
          </button>
        </Section>

        {/* ── Nutrition (computed live; the server recomputes on save) ── */}
        <Section title="Nutrition (per serving)">
          <NutritionPreview
            live={live}
            note={
              recipe.nutritionStatus === 'USER_ENTERED'
                ? 'This recipe shows numbers you typed in earlier. Saving replaces them with the numbers computed from its ingredients.'
                : undefined
            }
          />
        </Section>

        {/* ── Submit ─────────────────────────────────────────────────── */}
        <div>
          <FormErrorSummary errors={errors} />
          {updateMutation.error && (
            <p
              role="alert"
              className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600"
            >
              {userFacingErrorMessage(updateMutation.error)}
            </p>
          )}

          <div className="flex flex-col-reverse gap-3 pb-8 sm:flex-row sm:justify-end">
            <Link
              href="/recipes?tab=my"
              className="flex min-h-11 items-center justify-center rounded-xl border bg-white px-5 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={updateMutation.isPending}
              className="flex min-h-11 items-center justify-center rounded-xl bg-[#944a00] px-6 text-sm font-semibold text-white transition-colors hover:bg-[#7a3d00] disabled:opacity-60"
            >
              {updateMutation.isPending ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
