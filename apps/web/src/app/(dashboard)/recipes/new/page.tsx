'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Ingredient {
  name: string;
  quantity: string;
  unit: string;
}

interface NutritionInfo {
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  fiber: string;
}

interface FormErrors {
  name?: string;
  description?: string;
  cuisineType?: string;
  prepTimeMins?: string;
  cookTimeMins?: string;
  servings?: string;
  ingredients?: string;
  instructions?: string;
  calories?: string;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NewRecipePage() {
  const router = useRouter();

  // Basic fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [cuisineType, setCuisineType] = useState('');
  const [prepTimeMins, setPrepTimeMins] = useState('');
  const [cookTimeMins, setCookTimeMins] = useState('');
  const [servings, setServings] = useState('1');
  const [imageUrl, setImageUrl] = useState('');
  const [dietaryTags, setDietaryTags] = useState('');

  // Ingredients
  const [ingredients, setIngredients] = useState<Ingredient[]>([
    { name: '', quantity: '', unit: '' },
  ]);

  // Instructions
  const [instructions, setInstructions] = useState<string[]>(['']);

  // Nutrition
  const [nutrition, setNutrition] = useState<NutritionInfo>({
    calories: '',
    protein: '',
    carbs: '',
    fat: '',
    fiber: '0',
  });

  const [errors, setErrors] = useState<FormErrors>({});

  const createMutation = trpc.recipe.create.useMutation({
    onSuccess: () => {
      router.push('/recipes?tab=my');
    },
  });

  // ─── Helpers ────────────────────────────────────────────────────────────────

  const addIngredient = () =>
    setIngredients((prev) => [...prev, { name: '', quantity: '', unit: '' }]);

  const removeIngredient = (i: number) =>
    setIngredients((prev) => prev.filter((_, idx) => idx !== i));

  const updateIngredient = (i: number, field: keyof Ingredient, value: string) =>
    setIngredients((prev) =>
      prev.map((ing, idx) => (idx === i ? { ...ing, [field]: value } : ing)),
    );

  const addInstruction = () => setInstructions((prev) => [...prev, '']);

  const removeInstruction = (i: number) =>
    setInstructions((prev) => prev.filter((_, idx) => idx !== i));

  const updateInstruction = (i: number, value: string) =>
    setInstructions((prev) => prev.map((ins, idx) => (idx === i ? value : ins)));

  // ─── Validation & Submit ────────────────────────────────────────────────────

  const validate = (): boolean => {
    const errs: FormErrors = {};
    if (!name.trim()) errs.name = 'Recipe name is required.';
    if (!description.trim()) errs.description = 'Description is required.';
    if (!cuisineType.trim()) errs.cuisineType = 'Cuisine type is required.';
    if (!prepTimeMins || Number(prepTimeMins) < 0) errs.prepTimeMins = 'Enter prep time (0+).';
    if (!cookTimeMins || Number(cookTimeMins) < 0) errs.cookTimeMins = 'Enter cook time (0+).';
    if (!servings || Number(servings) < 1) errs.servings = 'At least 1 serving.';
    const validIngredients = ingredients.filter(
      (i) => i.name.trim() && i.quantity && i.unit.trim(),
    );
    if (validIngredients.length === 0) errs.ingredients = 'Add at least one ingredient.';
    const validInstructions = instructions.filter((s) => s.trim());
    if (validInstructions.length === 0) errs.instructions = 'Add at least one instruction step.';
    if (!nutrition.calories || Number(nutrition.calories) < 0) errs.calories = 'Enter calories.';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const validIngredients = ingredients
      .filter((i) => i.name.trim() && i.quantity && i.unit.trim())
      .map((i) => ({ name: i.name.trim(), quantity: Number(i.quantity), unit: i.unit.trim() }));

    const validInstructions = instructions.filter((s) => s.trim()).map((s) => s.trim());

    const tags = dietaryTags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    createMutation.mutate({
      name: name.trim(),
      description: description.trim(),
      cuisineType: cuisineType.trim(),
      prepTimeMins: Number(prepTimeMins),
      cookTimeMins: Number(cookTimeMins),
      servings: Number(servings),
      imageUrl: imageUrl.trim() || undefined,
      dietaryTags: tags,
      ingredients: validIngredients,
      instructions: validInstructions,
      nutritionInfo: {
        calories: Number(nutrition.calories),
        protein: Number(nutrition.protein) || 0,
        carbs: Number(nutrition.carbs) || 0,
        fat: Number(nutrition.fat) || 0,
        fiber: Number(nutrition.fiber) || 0,
      },
    });
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/recipes"
          className="flex h-9 w-9 items-center justify-center rounded-full border bg-white text-gray-500 hover:text-gray-800 shadow-sm transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">
            My Recipes
          </p>
          <h1 className="font-serif text-2xl font-bold text-gray-900">Create Recipe</h1>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* ── Basic Info ─────────────────────────────────────────────── */}
        <Section title="Basic Info">
          <Field label="Recipe Name" error={errors.name}>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Grandma's Pasta Sauce"
              className={inputCls(!!errors.name)}
            />
          </Field>

          <Field label="Description" error={errors.description}>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Brief description of the dish…"
              className={inputCls(!!errors.description)}
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Cuisine Type" error={errors.cuisineType}>
              <input
                type="text"
                value={cuisineType}
                onChange={(e) => setCuisineType(e.target.value)}
                placeholder="e.g. Italian"
                className={inputCls(!!errors.cuisineType)}
              />
            </Field>
            <Field label="Dietary Tags (comma-separated)">
              <input
                type="text"
                value={dietaryTags}
                onChange={(e) => setDietaryTags(e.target.value)}
                placeholder="e.g. vegan, gluten-free"
                className={inputCls(false)}
              />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Field label="Prep Time (mins)" error={errors.prepTimeMins}>
              <input
                type="number"
                min={0}
                value={prepTimeMins}
                onChange={(e) => setPrepTimeMins(e.target.value)}
                className={inputCls(!!errors.prepTimeMins)}
              />
            </Field>
            <Field label="Cook Time (mins)" error={errors.cookTimeMins}>
              <input
                type="number"
                min={0}
                value={cookTimeMins}
                onChange={(e) => setCookTimeMins(e.target.value)}
                className={inputCls(!!errors.cookTimeMins)}
              />
            </Field>
            <Field label="Servings" error={errors.servings}>
              <input
                type="number"
                min={1}
                value={servings}
                onChange={(e) => setServings(e.target.value)}
                className={inputCls(!!errors.servings)}
              />
            </Field>
          </div>

          <Field label="Image URL (optional)">
            <input
              type="text"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://…"
              className={inputCls(false)}
            />
          </Field>
        </Section>

        {/* ── Ingredients ────────────────────────────────────────────── */}
        <Section title="Ingredients" error={errors.ingredients}>
          <div className="space-y-2">
            {ingredients.map((ing, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="text"
                  value={ing.name}
                  onChange={(e) => updateIngredient(i, 'name', e.target.value)}
                  placeholder="Ingredient"
                  className="flex-1 rounded-xl border bg-white px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-[#944a00] focus:outline-none"
                />
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={ing.quantity}
                  onChange={(e) => updateIngredient(i, 'quantity', e.target.value)}
                  placeholder="Qty"
                  className="w-20 rounded-xl border bg-white px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-[#944a00] focus:outline-none"
                />
                <input
                  type="text"
                  value={ing.unit}
                  onChange={(e) => updateIngredient(i, 'unit', e.target.value)}
                  placeholder="Unit"
                  className="w-24 rounded-xl border bg-white px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-[#944a00] focus:outline-none"
                />
                {ingredients.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeIngredient(i)}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addIngredient}
            className="mt-2 flex items-center gap-1.5 text-sm font-medium text-[#944a00] hover:underline"
          >
            <Plus className="h-4 w-4" />
            Add Ingredient
          </button>
        </Section>

        {/* ── Instructions ───────────────────────────────────────────── */}
        <Section title="Instructions" error={errors.instructions}>
          <div className="space-y-2">
            {instructions.map((step, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="mt-2.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#fff3e8] text-[11px] font-bold text-[#944a00]">
                  {i + 1}
                </span>
                <textarea
                  value={step}
                  onChange={(e) => updateInstruction(i, e.target.value)}
                  rows={2}
                  placeholder={`Step ${i + 1}…`}
                  className="flex-1 rounded-xl border bg-white px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-[#944a00] focus:outline-none"
                />
                {instructions.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeInstruction(i)}
                    className="mt-2 flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addInstruction}
            className="mt-2 flex items-center gap-1.5 text-sm font-medium text-[#944a00] hover:underline"
          >
            <Plus className="h-4 w-4" />
            Add Step
          </button>
        </Section>

        {/* ── Nutrition ──────────────────────────────────────────────── */}
        <Section title="Nutrition (per serving)">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            <Field label="Calories (kcal)" error={errors.calories}>
              <input
                type="number"
                min={0}
                value={nutrition.calories}
                onChange={(e) => setNutrition((n) => ({ ...n, calories: e.target.value }))}
                className={inputCls(!!errors.calories)}
              />
            </Field>
            <Field label="Protein (g)">
              <input
                type="number"
                min={0}
                step="0.1"
                value={nutrition.protein}
                onChange={(e) => setNutrition((n) => ({ ...n, protein: e.target.value }))}
                className={inputCls(false)}
              />
            </Field>
            <Field label="Carbs (g)">
              <input
                type="number"
                min={0}
                step="0.1"
                value={nutrition.carbs}
                onChange={(e) => setNutrition((n) => ({ ...n, carbs: e.target.value }))}
                className={inputCls(false)}
              />
            </Field>
            <Field label="Fat (g)">
              <input
                type="number"
                min={0}
                step="0.1"
                value={nutrition.fat}
                onChange={(e) => setNutrition((n) => ({ ...n, fat: e.target.value }))}
                className={inputCls(false)}
              />
            </Field>
            <Field label="Fiber (g)">
              <input
                type="number"
                min={0}
                step="0.1"
                value={nutrition.fiber}
                onChange={(e) => setNutrition((n) => ({ ...n, fiber: e.target.value }))}
                className={inputCls(false)}
              />
            </Field>
          </div>
        </Section>

        {/* ── Submit ─────────────────────────────────────────────────── */}
        {createMutation.error && (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {createMutation.error.message}
          </p>
        )}

        <div className="flex justify-end gap-3 pb-8">
          <Link
            href="/recipes"
            className="rounded-xl border bg-white px-5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="rounded-xl bg-[#944a00] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#7a3d00] disabled:opacity-60 transition-colors"
          >
            {createMutation.isPending ? 'Saving…' : 'Save Recipe'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Section({
  title,
  children,
  error,
}: {
  title: string;
  children: React.ReactNode;
  error?: string | undefined;
}) {
  return (
    <div>
      <h2 className="mb-4 font-semibold text-gray-900 border-b pb-2">{title}</h2>
      <div className="space-y-4">{children}</div>
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-600">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}

function inputCls(hasError: boolean) {
  return `w-full rounded-xl border bg-white px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none ${
    hasError ? 'border-red-400 focus:border-red-500' : 'focus:border-[#944a00]'
  }`;
}
