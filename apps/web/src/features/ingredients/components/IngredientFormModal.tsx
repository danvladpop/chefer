'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { uploadImage } from '@/lib/upload-image';
import { Sparkles, Upload, X } from 'lucide-react';

// ─── Ingredient create/edit modal ─────────────────────────────────────────────
// Create mode: adds a private custom ingredient (used by the recipe form's
// picker and the Ingredients page).
// Edit mode: updates an editable row — own custom ingredients, or global
// catalog rows when the user is an admin. Name is locked in edit mode (it is
// the primary key); price fields are only exposed when editing.

export interface IngredientFormInitial {
  name: string;
  imageUrl: string | null;
  caloriesPer100g: number | null;
  proteinPer100g: number | null;
  carbsPer100g: number | null;
  fatPer100g: number | null;
  fiberPer100g: number | null;
  gramsPerPiece: number | null;
  pricePer100gEur: number | null;
  pricePer100mlEur: number | null;
  pricePerPieceEur: number | null;
}

interface IngredientFormModalProps {
  mode: 'create' | 'edit';
  /** Prefill: the search query in create mode, the full row in edit mode. */
  initialName?: string;
  initial?: IngredientFormInitial;
  onSaved: (displayName: string) => void;
  onClose: () => void;
}

const numStr = (v: number | null | undefined) => (v == null ? '' : String(v));

export function IngredientFormModal({
  mode,
  initialName,
  initial,
  onSaved,
  onClose,
}: IngredientFormModalProps) {
  const isEdit = mode === 'edit';

  const [name, setName] = useState(initial?.name ?? initialName ?? '');
  const [imageUrl, setImageUrl] = useState<string | null>(initial?.imageUrl ?? null);
  const [generateAiImage, setGenerateAiImage] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [macros, setMacros] = useState({
    calories: numStr(initial?.caloriesPer100g),
    protein: numStr(initial?.proteinPer100g),
    carbs: numStr(initial?.carbsPer100g),
    fat: numStr(initial?.fatPer100g),
    fiber: initial?.fiberPer100g != null ? String(initial.fiberPer100g) : '0',
  });
  const [gramsPerPiece, setGramsPerPiece] = useState(numStr(initial?.gramsPerPiece));
  const [prices, setPrices] = useState({
    per100g: numStr(initial?.pricePer100gEur),
    per100ml: numStr(initial?.pricePer100mlEur),
    perPiece: numStr(initial?.pricePerPieceEur),
  });

  const createMutation = trpc.ingredients.createCustom.useMutation({
    onSuccess: (row) => onSaved(row.displayName),
  });
  const updateMutation = trpc.ingredients.update.useMutation({
    onSuccess: (row) => onSaved(row.displayName),
  });
  const mutation = isEdit ? updateMutation : createMutation;

  const handleUpload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const url = await uploadImage(file);
      setImageUrl(url);
      setGenerateAiImage(false);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const canSubmit =
    name.trim().length >= 2 && macros.calories !== '' && Number(macros.calories) >= 0;

  const submit = () => {
    if (!canSubmit) return;
    const shared = {
      caloriesPer100g: Number(macros.calories),
      proteinPer100g: Number(macros.protein) || 0,
      carbsPer100g: Number(macros.carbs) || 0,
      fatPer100g: Number(macros.fat) || 0,
      fiberPer100g: Number(macros.fiber) || 0,
      gramsPerPiece: gramsPerPiece ? Number(gramsPerPiece) : null,
    };
    if (isEdit) {
      updateMutation.mutate({
        name: name.trim(),
        // Only send imageUrl when it changed; generateAiImage regenerates it
        ...(imageUrl !== (initial?.imageUrl ?? null) ? { imageUrl } : {}),
        generateAiImage: !imageUrl && generateAiImage,
        ...shared,
        pricePer100gEur: prices.per100g ? Number(prices.per100g) : null,
        pricePer100mlEur: prices.per100ml ? Number(prices.per100ml) : null,
        pricePerPieceEur: prices.perPiece ? Number(prices.perPiece) : null,
      });
    } else {
      createMutation.mutate({
        name: name.trim(),
        imageUrl,
        generateAiImage: !imageUrl && generateAiImage,
        ...shared,
      });
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={isEdit ? 'Edit ingredient' : 'Create custom ingredient'}
    >
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">
            {isEdit ? 'Edit ingredient' : 'Custom ingredient'}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {!isEdit && (
          <p className="mb-4 text-xs text-gray-500">
            Only you will see this ingredient. Nutrition values are per 100 g and drive the
            automatic recipe nutrition.
          </p>
        )}

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isEdit}
              className="w-full rounded-xl border bg-white px-3 py-2 text-sm focus:border-[#944a00] focus:outline-none disabled:bg-gray-50 disabled:text-gray-500"
            />
          </div>

          {/* Image: upload or AI */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Image</label>
            <div className="flex items-center gap-2">
              {imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl} alt="" className="h-12 w-12 rounded-lg object-cover" />
              )}
              <label className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50">
                <Upload className="h-3.5 w-3.5" />
                {uploading ? 'Uploading…' : imageUrl ? 'Replace' : 'Upload'}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => void handleUpload(e.target.files?.[0])}
                />
              </label>
              <button
                type="button"
                onClick={() => {
                  setGenerateAiImage((v) => !v);
                  setImageUrl(null);
                }}
                className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition ${
                  generateAiImage && !imageUrl
                    ? 'border-amber-400 bg-amber-50 text-amber-700'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Sparkles className="h-3.5 w-3.5" />
                {generateAiImage && !imageUrl ? 'AI image ✓' : 'Generate with AI'}
              </button>
            </div>
            {uploadError && <p className="mt-1 text-xs text-red-500">{uploadError}</p>}
          </div>

          {/* Macros per 100 g */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Nutrition per 100 g
            </label>
            <div className="grid grid-cols-5 gap-2">
              {(
                [
                  ['calories', 'kcal'],
                  ['protein', 'P (g)'],
                  ['carbs', 'C (g)'],
                  ['fat', 'F (g)'],
                  ['fiber', 'Fib (g)'],
                ] as const
              ).map(([key, label]) => (
                <div key={key}>
                  <span className="mb-0.5 block text-center text-[10px] text-gray-400">
                    {label}
                  </span>
                  <input
                    type="number"
                    min={0}
                    step="0.1"
                    value={macros[key]}
                    onChange={(e) => setMacros((m) => ({ ...m, [key]: e.target.value }))}
                    className="w-full rounded-lg border bg-white px-2 py-1.5 text-center text-sm focus:border-[#944a00] focus:outline-none"
                  />
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Grams per piece{' '}
              <span className="text-gray-400">(optional — for countable items)</span>
            </label>
            <input
              type="number"
              min={1}
              value={gramsPerPiece}
              onChange={(e) => setGramsPerPiece(e.target.value)}
              placeholder="e.g. 118 for a banana"
              className="w-full rounded-xl border bg-white px-3 py-2 text-sm focus:border-[#944a00] focus:outline-none"
            />
          </div>

          {/* Prices — only exposed when editing (baseline estimates in EUR) */}
          {isEdit && (
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Baseline prices (EUR){' '}
                <span className="text-gray-400">— leave empty when not applicable</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    ['per100g', 'per 100 g'],
                    ['per100ml', 'per 100 ml'],
                    ['perPiece', 'per piece'],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key}>
                    <span className="mb-0.5 block text-center text-[10px] text-gray-400">
                      {label}
                    </span>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={prices[key]}
                      onChange={(e) => setPrices((p) => ({ ...p, [key]: e.target.value }))}
                      className="w-full rounded-lg border bg-white px-2 py-1.5 text-center text-sm focus:border-[#944a00] focus:outline-none"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {mutation.isError && <p className="text-xs text-red-500">{mutation.error.message}</p>}

          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit || mutation.isPending || uploading}
            className="w-full rounded-xl bg-[#944a00] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#7a3d00] disabled:opacity-50"
          >
            {mutation.isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Create ingredient'}
          </button>
        </div>
      </div>
    </div>
  );
}
