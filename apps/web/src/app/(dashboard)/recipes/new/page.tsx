'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
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
import { uploadImage } from '@/lib/upload-image';
import { ArrowLeft, Plus, Sparkles, Trash2, Upload, X } from 'lucide-react';
import { CUISINE_PRESETS } from '@chefer/types';
import { userFacingErrorMessage } from '@chefer/utils';

// ─── Presets (T-40.6: CUISINE_PRESETS moved to @chefer/types, shared with mobile) ──

const DIETARY_TAG_PRESETS = [
  'vegan',
  'vegetarian',
  'gluten-free',
  'dairy-free',
  'keto',
  'paleo',
  'low-carb',
  'high-protein',
  'pescatarian',
  'nut-free',
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NewRecipePage() {
  const router = useRouter();

  // Stable ids so every control has a real <label htmlFor> / aria-describedby
  // target (F-X-5-1, F-REC-3-7).
  const uid = useId();
  const ids = {
    name: `${uid}-name`,
    description: `${uid}-description`,
    cuisine: `${uid}-cuisine`,
    cuisineFirstChip: `${uid}-cuisine-first`,
    cuisineCustom: `${uid}-cuisine-custom`,
    dietaryTags: `${uid}-dietary-tags`,
    prepTimeMins: `${uid}-prep`,
    cookTimeMins: `${uid}-cook`,
    servings: `${uid}-servings`,
    ingredients: `${uid}-ingredients`,
    instructions: `${uid}-instructions`,
  };
  const stepId = (i: number) => `${uid}-step-${i}`;

  // Basic fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [cuisineChip, setCuisineChip] = useState<string | null>(null);
  const [cuisineCustom, setCuisineCustom] = useState('');
  const [useCustomCuisine, setUseCustomCuisine] = useState(false);
  const [prepTimeMins, setPrepTimeMins] = useState('');
  const [cookTimeMins, setCookTimeMins] = useState('');
  const [servings, setServings] = useState('1');

  // Dietary tags: preset chips + free-text additions
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');

  // Image
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageSource, setImageSource] = useState<'upload' | 'ai' | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Ingredients & instructions. Every line is picked from the catalog
  // (plan-ingredient-catalog §10) and stores its ingredientId.
  const [lines, setLines] = useState<LineRow[]>(() => [newLineRow()]);
  const [instructions, setInstructions] = useState<string[]>(['']);

  const { errors, clear: clearError, report: reportErrors } = useRecipeFormErrors();

  const cuisineType = useCustomCuisine ? cuisineCustom.trim() : (cuisineChip ?? '');

  // Nutrition is never typed on web any more: the live preview runs the
  // shared engine over the picked rows, and the server computes the stored
  // numbers on save (D4 keeps typed numbers for old clients only).
  const servingsNum = Math.max(1, Number(servings) || 1);
  const live = useLiveNutrition(lines, servingsNum);

  // ── AI image generation (deterministic URL from name + cuisine) ────────────
  const aiImageQuery = trpc.recipe.aiImageUrl.useQuery(
    { name: name.trim(), cuisineType },
    { enabled: false },
  );

  const generateAiImage = async () => {
    setUploadError(null);
    const res = await aiImageQuery.refetch();
    if (res.data) {
      setImageUrl(res.data.url);
      setImageSource('ai');
    }
  };

  const handleUpload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const url = await uploadImage(file);
      setImageUrl(url);
      setImageSource('upload');
    } catch (err) {
      setUploadError(userFacingErrorMessage(err, 'Upload failed'));
    } finally {
      setUploading(false);
    }
  };

  // ── Mutation ───────────────────────────────────────────────────────────────
  const createMutation = trpc.recipe.create.useMutation({
    meta: { silent: true },
    onSuccess: () => {
      router.push('/recipes?tab=my');
    },
  });

  // ── Row helpers ────────────────────────────────────────────────────────────
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

  const addTag = (tag: string) => {
    const t = tag.trim().toLowerCase();
    if (t && !tags.includes(t)) setTags((prev) => [...prev, t]);
    setTagInput('');
  };

  // ── Validation & submit ────────────────────────────────────────────────────
  // T-40.6 (D-19): the whole minimum is a name and >= 1 ingredient line with
  // an amount. Cuisine and nutrition (computed or manual) are both optional —
  // they used to be hard-blocked here, which is exactly UX-40's "36 boxes"
  // complaint on web's side of the parity gap.
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

    // Where focus lands for each error: the first incomplete ingredient row's
    // missing field.
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

    createMutation.mutate({
      name: name.trim(),
      description: description.trim(),
      cuisineType,
      prepTimeMins: Number(prepTimeMins),
      cookTimeMins: Number(cookTimeMins),
      servings: servingsNum,
      imageUrl: imageUrl ?? undefined,
      dietaryTags: tags,
      // Lines carry their ingredientId; the server computes nutrition.
      ingredients: toSaveLines(lines),
      instructions: instructions.filter((s) => s.trim()).map((s) => s.trim()),
    });
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/recipes"
          aria-label="Back to recipes"
          className="touch-target relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border bg-white text-gray-500 shadow-sm transition-colors hover:text-gray-800"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </Link>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">
            My Recipes
          </p>
          <h1 className="font-serif text-2xl font-bold text-gray-900">Create Recipe</h1>
        </div>
      </div>
      <RequiredLegend />

      {/* noValidate: our own validation owns the messages — the browser's
          tooltip fought it (and pointed at fields under the sticky header). */}
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
              placeholder="e.g. Grandma's Pasta Sauce"
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
              {...fieldErrorProps(ids.description, errors.description)}
              rows={3}
              placeholder="Brief description of the dish…"
              className={inputCls(!!errors.description)}
            />
          </Field>

          {/* Cuisine chips + free text */}
          <Field id={ids.cuisine} label="Cuisine" error={errors.cuisineType} group>
            <div className="flex flex-wrap gap-2">
              {CUISINE_PRESETS.map((c, idx) => (
                <Chip
                  key={c}
                  id={idx === 0 ? ids.cuisineFirstChip : undefined}
                  label={c}
                  active={!useCustomCuisine && cuisineChip === c}
                  onClick={() => {
                    setCuisineChip(c);
                    setUseCustomCuisine(false);
                    clearError('cuisineType');
                  }}
                />
              ))}
              <Chip
                label="Other…"
                active={useCustomCuisine}
                onClick={() => setUseCustomCuisine(true)}
              />
            </div>
            {useCustomCuisine && (
              <input
                id={ids.cuisineCustom}
                type="text"
                value={cuisineCustom}
                onChange={(e) => {
                  setCuisineCustom(e.target.value);
                  clearError('cuisineType');
                }}
                placeholder="e.g. Fusion, Nordic…"
                aria-label="Custom cuisine"
                {...fieldErrorProps(ids.cuisine, errors.cuisineType)}
                className={`mt-2 ${inputCls(!!errors.cuisineType)}`}
              />
            )}
          </Field>

          {/* Dietary tag chips + free text */}
          <Field id={ids.dietaryTags} label="Dietary Tags" group>
            <div className="flex flex-wrap gap-2">
              {DIETARY_TAG_PRESETS.map((t) => (
                <Chip
                  key={t}
                  label={t}
                  active={tags.includes(t)}
                  onClick={() =>
                    setTags((prev) =>
                      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
                    )
                  }
                />
              ))}
            </div>
            {/* Custom tags the user added */}
            {tags.filter((t) => !DIETARY_TAG_PRESETS.includes(t)).length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {tags
                  .filter((t) => !DIETARY_TAG_PRESETS.includes(t))
                  .map((t) => (
                    <span
                      key={t}
                      className="flex items-center gap-1 rounded-full bg-[#fff3e8] px-2.5 py-1 text-xs font-medium text-[#944a00]"
                    >
                      {t}
                      <button
                        type="button"
                        onClick={() => setTags((prev) => prev.filter((x) => x !== t))}
                        aria-label={`Remove ${t} tag`}
                        className="touch-target relative rounded-full"
                      >
                        <X className="h-3 w-3" aria-hidden="true" />
                      </button>
                    </span>
                  ))}
              </div>
            )}
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault();
                  addTag(tagInput);
                }
              }}
              placeholder="Add your own tag and press Enter…"
              aria-label="Add a custom dietary tag"
              className={`mt-2 ${inputCls(false)}`}
            />
          </Field>

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
        </Section>

        {/* ── Photo ──────────────────────────────────────────────────── */}
        <Section title="Photo">
          <div className="flex flex-col items-start gap-4 sm:flex-row">
            {imageUrl ? (
              <div className="relative w-full sm:w-auto">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageUrl}
                  alt="Recipe preview"
                  className="h-40 w-full rounded-xl border object-cover sm:h-28 sm:w-36"
                />
                <button
                  type="button"
                  onClick={() => {
                    setImageUrl(null);
                    setImageSource(null);
                  }}
                  aria-label="Remove image"
                  className="touch-target absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-gray-800 text-white shadow hover:bg-gray-600"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                {imageSource === 'ai' && (
                  <span className="absolute bottom-1 left-1 rounded-full bg-black/50 px-1.5 py-0.5 text-xs font-medium text-white">
                    AI generated
                  </span>
                )}
              </div>
            ) : (
              <div className="flex h-40 w-full items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 text-3xl sm:h-28 sm:w-36">
                🍽️
              </div>
            )}

            <div className="flex w-full flex-col gap-2 sm:w-auto">
              <label className="flex min-h-11 w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 focus-within:ring-2 focus-within:ring-[#944a00] hover:bg-gray-50 sm:min-h-0 sm:w-fit sm:justify-start">
                <Upload className="h-3.5 w-3.5" />
                {uploading ? 'Uploading…' : 'Upload from device'}
                <input
                  type="file"
                  accept="image/*"
                  // sr-only, not hidden: display:none took the upload out of the tab order.
                  className="sr-only"
                  onChange={(e) => void handleUpload(e.target.files?.[0])}
                />
              </label>
              <button
                type="button"
                onClick={() => void generateAiImage()}
                disabled={name.trim().length < 2 || aiImageQuery.isFetching}
                title={name.trim().length < 2 ? 'Enter a recipe name first' : undefined}
                className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50 sm:min-h-0 sm:w-fit sm:justify-start"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {aiImageQuery.isFetching ? 'Generating…' : 'Generate with AI'}
              </button>
              <p className="text-xs text-gray-500">
                Upload a photo from your phone or computer, or let AI create one from the recipe
                name. The AI image may take ~20 s to appear the first time.
              </p>
              {uploadError && (
                <p role="alert" className="text-xs text-red-600">
                  {uploadError}
                </p>
              )}
            </div>
          </div>
        </Section>

        {/* ── Ingredients ────────────────────────────────────────────── */}
        <Section
          title="Ingredients *"
          error={errors.ingredients}
          errorId={errorIdFor(ids.ingredients)}
        >
          <RecipeLinesEditor
            rows={lines}
            onChange={updateLines}
            problems={live.problems}
            idPrefix={uid}
            error={errors.ingredients}
            errorId={errorIdFor(ids.ingredients)}
          />
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
          <NutritionPreview live={live} />
        </Section>

        {/* ── Submit ─────────────────────────────────────────────────── */}
        <div>
          <FormErrorSummary errors={errors} />
          {createMutation.error && (
            <p
              role="alert"
              className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600"
            >
              {userFacingErrorMessage(createMutation.error)}
            </p>
          )}

          <div className="flex flex-col-reverse gap-3 pb-8 sm:flex-row sm:justify-end">
            <Link
              href="/recipes"
              className="flex min-h-11 items-center justify-center rounded-xl border bg-white px-5 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50"
            >
              Cancel
            </Link>
            <button
              type="submit"
              // UX-REC-12: a Save mid-upload would store the recipe without its photo.
              disabled={createMutation.isPending || uploading}
              className="flex min-h-11 items-center justify-center rounded-xl bg-[#944a00] px-6 text-sm font-semibold text-white transition-colors hover:bg-[#7a3d00] disabled:opacity-60"
            >
              {createMutation.isPending
                ? 'Saving…'
                : uploading
                  ? 'Uploading photo…'
                  : 'Save Recipe'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Chip({
  id,
  label,
  active,
  onClick,
}: {
  id?: string | undefined;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  // touch-target: a 44px hit area without making 22 chips 44px tall; the
  // gap-2 rows keep neighbouring hit areas from overlapping (F-X-2-1).
  return (
    <button
      id={id}
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`touch-target relative rounded-full border px-3 py-1.5 text-xs font-medium transition ${
        active
          ? 'border-[#944a00] bg-[#944a00] text-white'
          : 'border-gray-200 bg-white text-gray-600 hover:border-[#944a00]/40 hover:text-[#944a00]'
      }`}
    >
      {label}
    </button>
  );
}
