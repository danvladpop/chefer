'use client';

import { useId, useState } from 'react';
import { SourceBadge } from '@/features/ingredients/components/SourceBadge';
import {
  pickedFromRef,
  pickedFromSearch,
  type PickedIngredient,
} from '@/features/ingredients/lib/picked-ingredient';
import { trpc, type RouterOutputs } from '@/lib/trpc';
import { uploadImage } from '@/lib/upload-image';
import { Sparkles, Upload } from 'lucide-react';
import { INGREDIENT_CATEGORIES, type IngredientCategory } from '@chefer/types';
import { cn, pressControl, Sheet } from '@chefer/ui';
import { INGREDIENT_CATEGORY_LABELS } from '@chefer/utils';

// ─── Private ingredient sheet (plan-ingredient-catalog §8.1, D5, D7) ─────────
// Create: a private ingredient from the package label — the five core values
// per 100 g are required, portions ("1 piece = 45 g") and density are
// optional. If Chefer already has it, the server answers CONFLICT and the
// sheet offers the catalog row ("Use it") or an explicit "No, mine is
// different" that resends with `confirmDifferent`.
// Edit: the owner's private row (everything, by id), or — for an admin — a
// global row's price and image only; global nutrition is read-only (D7).

export type CatalogListItem = RouterOutputs['ingredients']['catalogList']['items'][number];

type MacroKey = 'calories' | 'protein' | 'carbs' | 'fat' | 'fiber';
type ErrorKey = MacroKey | 'name' | 'piece' | 'density';

const MACROS: { key: MacroKey; label: string; hint?: string; max: number }[] = [
  { key: 'calories', label: 'Energy (kcal)', max: 900 },
  { key: 'protein', label: 'Protein (g)', max: 100 },
  {
    key: 'carbs',
    label: 'Carbs (g)',
    hint: 'Carbohydrate as on an EU label, without fiber',
    max: 100,
  },
  { key: 'fat', label: 'Fat (g)', max: 100 },
  { key: 'fiber', label: 'Fiber (g)', max: 100 },
];

const numStr = (v: number | null | undefined) => (v == null ? '' : String(v));

type CreateProps = {
  mode: 'create';
  /** The picker's query. */
  initialName?: string;
  /** The new ingredient, ready to link to the recipe line (null if it can't be linked). */
  onSaved: (ingredient: PickedIngredient | null) => void;
  /** "Use it" on a CONFLICT: the catalog row the user chose instead. */
  onUseExisting?: (ingredient: PickedIngredient) => void;
  onClose: () => void;
};

type EditProps = {
  mode: 'edit';
  item: CatalogListItem;
  onSaved: () => void;
  onClose: () => void;
};

export function IngredientFormModal(props: CreateProps | EditProps) {
  const { onClose } = props;
  const item = props.mode === 'edit' ? props.item : null;
  const onUseExisting = props.mode === 'create' ? props.onUseExisting : undefined;
  const globalEdit = item !== null && item.editable === 'priceImage';
  const uid = useId();
  const fieldId = (k: string) => `${uid}-${k}`;
  const utils = trpc.useUtils();

  const [name, setName] = useState(
    item?.name ?? (props.mode === 'create' ? (props.initialName ?? '') : ''),
  );
  const [category, setCategory] = useState<IngredientCategory>(item?.category ?? 'OTHER');
  const [macros, setMacros] = useState<Record<MacroKey, string>>({
    calories: numStr(item?.per100g.calories),
    protein: numStr(item?.per100g.protein),
    carbs: numStr(item?.per100g.carbs),
    fat: numStr(item?.per100g.fat),
    fiber: numStr(item?.per100g.fiber),
  });
  const [gramsPerPiece, setGramsPerPiece] = useState(
    numStr(item?.portions.find((p) => p.unit === 'piece')?.grams),
  );
  const [density, setDensity] = useState(numStr(item?.densityGPerMl));
  const [imageUrl, setImageUrl] = useState<string | null>(item ? item.imageUrl : null);
  const [generateAiImage, setGenerateAiImage] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [prices, setPrices] = useState({
    per100g: numStr(item?.prices?.per100gEur),
    per100ml: numStr(item?.prices?.per100mlEur),
    perPiece: numStr(item?.prices?.perPieceEur),
  });
  const [errors, setErrors] = useState<Partial<Record<ErrorKey, string>>>({});
  const [conflict, setConflict] = useState<PickedIngredient | null>(null);
  const [checkingConflict, setCheckingConflict] = useState(false);

  const createMutation = trpc.ingredients.createCustom.useMutation({
    onSuccess: (row) => {
      if (props.mode === 'create') props.onSaved(pickedFromSearch(row));
    },
    onError: async (err) => {
      if (err.data?.code !== 'CONFLICT') return;
      // Find the catalog row the server matched, to offer it by name.
      setCheckingConflict(true);
      try {
        const [hit] = await utils.ingredients.resolve.fetch({ lines: [{ rawName: name.trim() }] });
        if (hit?.match) setConflict(pickedFromRef(hit.match));
      } finally {
        setCheckingConflict(false);
      }
    },
  });
  const updateMutation = trpc.ingredients.update.useMutation({
    onSuccess: () => {
      if (props.mode === 'edit') props.onSaved();
    },
  });
  const mutation = props.mode === 'edit' ? updateMutation : createMutation;

  // D5: the optional pre-fill is labelled and editable; the stored source stays USER.
  const estimateMutation = trpc.ingredients.estimateNutrition.useMutation({
    onSuccess: (est) => {
      if (!est) return;
      setMacros({
        calories: numStr(est.caloriesPer100g),
        protein: numStr(est.proteinPer100g),
        carbs: numStr(est.carbsPer100g),
        fat: numStr(est.fatPer100g),
        fiber: numStr(est.fiberPer100g),
      });
      if (est.gramsPerPiece != null) setGramsPerPiece(String(est.gramsPerPiece));
      setErrors({});
    },
  });

  const handleUpload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      setImageUrl(await uploadImage(file));
      setGenerateAiImage(false);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const validate = (): boolean => {
    const errs: Partial<Record<ErrorKey, string>> = {};
    if (!globalEdit) {
      if (name.trim().length < 2) errs.name = 'Give it a name (2 letters or more).';
      for (const m of MACROS) {
        const raw = macros[m.key].trim();
        const v = Number(raw);
        if (raw === '') errs[m.key] = 'Required — copy it from the label.';
        else if (!Number.isFinite(v) || v < 0 || v > m.max) errs[m.key] = `Between 0 and ${m.max}.`;
      }
      const grams = (['protein', 'carbs', 'fat', 'fiber'] as const).reduce(
        (sum, k) => sum + (Number(macros[k]) || 0),
        0,
      );
      if (!errs.protein && grams > 100.5) {
        errs.protein = 'Protein, carbs, fat and fiber add up to more than 100 g.';
      }
      if (gramsPerPiece.trim() && !(Number(gramsPerPiece) > 0)) errs.piece = 'A weight above 0.';
      if (density.trim() && !(Number(density) > 0 && Number(density) <= 3)) {
        errs.density = 'Between 0 and 3 g per ml.';
      }
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const submit = (confirmDifferent = false) => {
    if (!validate()) return;
    const image = { imageUrl, generateAiImage: !imageUrl && generateAiImage };
    const core = {
      caloriesPer100g: Number(macros.calories),
      proteinPer100g: Number(macros.protein),
      carbsPer100g: Number(macros.carbs),
      fatPer100g: Number(macros.fat),
      fiberPer100g: Number(macros.fiber),
      gramsPerPiece: gramsPerPiece.trim() ? Number(gramsPerPiece) : null,
    };
    if (props.mode === 'create') {
      createMutation.mutate({
        name: name.trim(),
        category,
        densityGPerMl: density.trim() ? Number(density) : null,
        ...core,
        ...image,
        ...(confirmDifferent ? { confirmDifferent: true } : {}),
      });
      return;
    }
    if (!item) return;
    if (globalEdit) {
      // Prices and image of the linked price row; the macros sent are the
      // row's own and are ignored server-side for global rows (D7).
      updateMutation.mutate({
        name: item.priceRowName ?? item.name,
        caloriesPer100g: item.per100g.calories,
        proteinPer100g: item.per100g.protein,
        carbsPer100g: item.per100g.carbs,
        fatPer100g: item.per100g.fat,
        fiberPer100g: item.per100g.fiber,
        ...(imageUrl !== item.imageUrl ? { imageUrl } : {}),
        generateAiImage: !imageUrl && generateAiImage,
        pricePer100gEur: prices.per100g ? Number(prices.per100g) : null,
        pricePer100mlEur: prices.per100ml ? Number(prices.per100ml) : null,
        pricePerPieceEur: prices.perPiece ? Number(prices.perPiece) : null,
      });
      return;
    }
    updateMutation.mutate({
      id: item.id,
      name: name.trim(),
      category,
      densityGPerMl: density.trim() ? Number(density) : null,
      ...core,
      ...(imageUrl !== item.imageUrl ? { imageUrl } : {}),
      generateAiImage: !imageUrl && generateAiImage,
    });
  };

  const errorFor = (key: ErrorKey) =>
    errors[key]
      ? { 'aria-invalid': true as const, 'aria-describedby': `${fieldId(key)}-error` }
      : {};
  const errorText = (k: ErrorKey) =>
    errors[k] ? (
      <p id={`${fieldId(k)}-error`} className="mt-1 text-xs text-red-600">
        {errors[k]}
      </p>
    ) : null;

  const inputCls = (bad: boolean) =>
    cn(
      'w-full rounded-xl border bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none',
      bad ? 'border-red-400 focus:border-red-500' : 'focus:border-[#944a00]',
    );

  const title =
    props.mode === 'create'
      ? 'New private ingredient'
      : globalEdit
        ? 'Edit price and image'
        : 'Edit my ingredient';

  const footer = conflict ? (
    <div className="space-y-2">
      <p role="alert" className="text-sm text-gray-800">
        Chefer already has <strong>{conflict.name}</strong>.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        {onUseExisting ? (
          <button
            type="button"
            onClick={() => onUseExisting(conflict)}
            className={cn(
              'min-h-11 flex-1 rounded-xl bg-[#944a00] px-4 text-sm font-semibold text-white hover:bg-[#7a3d00]',
              pressControl,
            )}
          >
            Use it
          </button>
        ) : (
          <button
            type="button"
            onClick={onClose}
            className={cn(
              'min-h-11 flex-1 rounded-xl border px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50',
              pressControl,
            )}
          >
            Cancel
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            setConflict(null);
            submit(true);
          }}
          className={cn(
            'min-h-11 flex-1 rounded-xl border border-[#944a00]/40 px-4 text-sm font-semibold text-[#944a00] hover:bg-[#fff3e8]',
            pressControl,
          )}
        >
          No, mine is different
        </button>
      </div>
    </div>
  ) : (
    <button
      type="button"
      onClick={() => submit()}
      disabled={mutation.isPending || uploading || checkingConflict}
      className={cn(
        'min-h-11 w-full rounded-xl bg-[#944a00] px-4 text-sm font-semibold text-white hover:bg-[#7a3d00] disabled:opacity-50',
        pressControl,
      )}
    >
      {mutation.isPending || checkingConflict
        ? 'Saving…'
        : props.mode === 'create'
          ? 'Create ingredient'
          : 'Save changes'}
    </button>
  );

  return (
    <Sheet
      open
      onClose={onClose}
      title={title}
      description={
        props.mode === 'create'
          ? 'Only you see it. Copy the values per 100 g from the package label — your recipes compute from them.'
          : globalEdit
            ? 'Nutrition of Chefer’s ingredients comes from cited food data and can’t be edited here.'
            : 'Only you see it. Your recipes that use it are recomputed when you save.'
      }
      footer={footer}
    >
      <div className="space-y-4 px-5 pb-5">
        {item && globalEdit ? (
          <div className="rounded-xl border bg-gray-50 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 truncate text-sm font-semibold text-gray-900">{item.name}</p>
              <SourceBadge source={item.nutritionSource} owner={item.owner} />
            </div>
            <p className="mt-1 text-xs text-gray-600">
              {Math.round(item.per100g.calories)} kcal · P {item.per100g.protein} · C{' '}
              {item.per100g.carbs} · F {item.per100g.fat} · Fiber {item.per100g.fiber} per 100 g
            </p>
          </div>
        ) : (
          <>
            <div>
              <label
                htmlFor={fieldId('name')}
                className="mb-1 block text-xs font-medium text-gray-600"
              >
                Name
              </label>
              <input
                id={fieldId('name')}
                type="text"
                value={name}
                maxLength={60}
                onChange={(e) => {
                  setName(e.target.value);
                  setConflict(null);
                }}
                {...errorFor('name')}
                className={inputCls(!!errors.name)}
              />
              {errorText('name')}
            </div>

            <div>
              <label
                htmlFor={fieldId('category')}
                className="mb-1 block text-xs font-medium text-gray-600"
              >
                Category
              </label>
              <select
                id={fieldId('category')}
                value={category}
                onChange={(e) => setCategory(e.target.value as IngredientCategory)}
                className={inputCls(false)}
              >
                {INGREDIENT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {INGREDIENT_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </div>

            <fieldset>
              <div className="mb-1 flex items-center justify-between gap-2">
                <legend className="text-xs font-medium text-gray-600">
                  Per 100 g (all required)
                </legend>
                <button
                  type="button"
                  onClick={() => estimateMutation.mutate({ name: name.trim() })}
                  disabled={name.trim().length < 2 || estimateMutation.isPending}
                  className={cn(
                    'flex min-h-11 items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-3 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50',
                    pressControl,
                  )}
                >
                  <Sparkles className="h-3 w-3" aria-hidden="true" />
                  {estimateMutation.isPending ? 'Filling in…' : 'Fill in for me'}
                </button>
              </div>
              {estimateMutation.isError && (
                <p className="mb-1 text-xs text-red-600">{estimateMutation.error.message}</p>
              )}
              {estimateMutation.isSuccess && estimateMutation.data !== null && (
                <p className="mb-1 text-xs text-amber-900">
                  {estimateMutation.data.source === 'catalog'
                    ? 'Filled in from saved data — check it against your label.'
                    : 'AI suggestion — check every value against your label before saving.'}
                </p>
              )}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {MACROS.map((m) => (
                  <div key={m.key} className="min-w-0">
                    <label
                      htmlFor={fieldId(m.key)}
                      className="mb-1 block text-xs font-medium text-gray-600"
                      title={m.hint}
                    >
                      {m.label}
                    </label>
                    <input
                      id={fieldId(m.key)}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={m.max}
                      step="0.1"
                      value={macros[m.key]}
                      onChange={(e) => setMacros((v) => ({ ...v, [m.key]: e.target.value }))}
                      aria-required="true"
                      {...errorFor(m.key)}
                      className={inputCls(!!errors[m.key])}
                    />
                    {errorText(m.key)}
                  </div>
                ))}
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Carbs are the label’s carbohydrate figure, without fiber.
              </p>
            </fieldset>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="min-w-0">
                <label
                  htmlFor={fieldId('piece')}
                  className="mb-1 block text-xs font-medium text-gray-600"
                >
                  Grams per piece (optional)
                </label>
                <input
                  id={fieldId('piece')}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  value={gramsPerPiece}
                  onChange={(e) => setGramsPerPiece(e.target.value)}
                  placeholder="e.g. 45 for one bar"
                  {...errorFor('piece')}
                  className={inputCls(!!errors.piece)}
                />
                {errorText('piece')}
              </div>
              <div className="min-w-0">
                <label
                  htmlFor={fieldId('density')}
                  className="mb-1 block text-xs font-medium text-gray-600"
                >
                  Grams per ml (optional)
                </label>
                <input
                  id={fieldId('density')}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={3}
                  step="0.01"
                  value={density}
                  onChange={(e) => setDensity(e.target.value)}
                  placeholder="Only if you measure it in cups or spoons"
                  {...errorFor('density')}
                  className={inputCls(!!errors.density)}
                />
                {errorText('density')}
              </div>
            </div>
          </>
        )}

        {/* Image: upload or AI */}
        <div>
          <span className="mb-1 block text-xs font-medium text-gray-600">Image (optional)</span>
          <div className="flex flex-wrap items-center gap-2">
            {imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt="" className="h-12 w-12 rounded-lg object-cover" />
            )}
            <label
              className={cn(
                'flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl border border-gray-200 px-3 text-xs font-medium text-gray-700 focus-within:ring-2 focus-within:ring-[#944a00] hover:bg-gray-50',
                pressControl,
              )}
            >
              <Upload className="h-3.5 w-3.5" aria-hidden="true" />
              {uploading ? 'Uploading…' : imageUrl ? 'Replace image' : 'Upload image'}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => void handleUpload(e.target.files?.[0])}
              />
            </label>
            <button
              type="button"
              onClick={() => {
                setGenerateAiImage((v) => !v);
                setImageUrl(null);
              }}
              aria-pressed={generateAiImage && !imageUrl}
              className={cn(
                'flex min-h-11 items-center gap-1.5 rounded-xl border px-3 text-xs font-medium',
                pressControl,
                generateAiImage && !imageUrl
                  ? 'border-amber-400 bg-amber-50 text-amber-800'
                  : 'border-gray-200 text-gray-700 hover:bg-gray-50',
              )}
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              {generateAiImage && !imageUrl ? 'AI image on' : 'Generate with AI'}
            </button>
          </div>
          {uploadError && <p className="mt-1 text-xs text-red-600">{uploadError}</p>}
        </div>

        {globalEdit && (
          <fieldset>
            <legend className="mb-1 text-xs font-medium text-gray-600">
              Baseline prices (EUR) — leave empty when not applicable
            </legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {(
                [
                  ['per100g', 'Per 100 g'],
                  ['per100ml', 'Per 100 ml'],
                  ['perPiece', 'Per piece'],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="min-w-0">
                  <label
                    htmlFor={fieldId(key)}
                    className="mb-1 block text-xs font-medium text-gray-600"
                  >
                    {label}
                  </label>
                  <input
                    id={fieldId(key)}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    value={prices[key]}
                    onChange={(e) => setPrices((p) => ({ ...p, [key]: e.target.value }))}
                    className={inputCls(false)}
                  />
                </div>
              ))}
            </div>
          </fieldset>
        )}

        {mutation.isError && mutation.error.data?.code !== 'CONFLICT' && (
          <p role="alert" className="text-sm text-red-600">
            {mutation.error.message}
          </p>
        )}
      </div>
    </Sheet>
  );
}
