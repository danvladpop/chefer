'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { UpgradeButton } from '@/features/premium/components/UpgradeButton';
import { useEntitlement } from '@/hooks/useEntitlement';
import { capture } from '@/lib/analytics';
import { trpc } from '@/lib/trpc';
import {
  AlertTriangle,
  Camera,
  ClipboardType,
  Clock,
  Flame,
  Link2,
  Loader2,
  Sparkles,
  Users,
} from 'lucide-react';
import { Sheet } from '@chefer/ui';
import { cn } from '@chefer/utils';

// ─── Cheferize Anything (F5) — import + diff sheet ───────────────────────────
// Free tier gets the real extraction preview (1/day, the §6.4 ghost state);
// the Cheferize diff renders blurred with the adaptation count visible and
// the upgrade CTA (source `recipe-import`). Premium sees the full diff and
// can save either variant. Copyright stance: personal collection only — the
// import keeps its source link and is never shown to other users.

type SourceTab = 'url' | 'text' | 'photo';

type ImportPreviewData = {
  via: 'url' | 'photo' | 'text';
  original: RecipePayload;
  adapted: RecipePayload;
  changes: { kind: string; description: string }[];
  safety: { ok: boolean; issues: string[] };
  macroCheck: {
    status: 'ok' | 'uncertain' | 'unknown';
    computedCaloriesPerServing: number | null;
    statedCaloriesPerServing: number;
  };
  sourceUrl: string | null;
  ogImageUrl: string | null;
};

type RecipePayload = {
  name: string;
  description: string;
  ingredients: { name: string; quantity: number; unit: string }[];
  instructions: string[];
  nutritionInfo: { calories: number; protein: number; carbs: number; fat: number; fiber: number };
  cuisineType: string;
  dietaryTags: string[];
  prepTimeMins: number;
  cookTimeMins: number;
  servings: number;
};

const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
const PHOTO_MIMES = ['image/jpeg', 'image/png', 'image/webp'] as const;
type PhotoMime = (typeof PHOTO_MIMES)[number];

export function ImportRecipeSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const { isPremium } = useEntitlement('recipeImport');

  const [tab, setTab] = useState<SourceTab>('url');
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<{ base64: string; mimeType: PhotoMime; name: string } | null>(
    null,
  );
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreviewData | null>(null);
  const [variant, setVariant] = useState<'adapted' | 'original'>('adapted');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const previewMutation = trpc.recipe.importPreview.useMutation({
    onSuccess: (data) => {
      capture('recipe_imported', { via: data.via });
      if (isPremium === false) capture('teaser_engaged', { feature: 'import' });
      setVariant(data.safety.ok && data.changes.length > 0 ? 'adapted' : 'original');
      setPreview(data);
    },
  });

  const saveMutation = trpc.recipe.importSave.useMutation({
    onSuccess: (recipe) => {
      if (variant === 'adapted') capture('recipe_cheferized');
      void utils.recipe.list.invalidate();
      onClose();
      router.push(`/recipes/${recipe.id}`);
    },
  });

  // Ghost-state impression (§6.4): a free user seeing the blurred diff counts
  // as an upgrade prompt shown for the `recipe-import` source.
  useEffect(() => {
    if (preview && isPremium === false) {
      capture('upgrade_prompt_shown', { source: 'recipe-import' });
    }
  }, [preview, isPremium]);

  const reset = () => {
    setPreview(null);
    previewMutation.reset();
    saveMutation.reset();
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handlePhotoPick = (file: File | undefined) => {
    setPhotoError(null);
    if (!file) return;
    if (file.size > MAX_PHOTO_BYTES) {
      setPhotoError('Photo is too large — 4 MB max.');
      return;
    }
    const mimeType = PHOTO_MIMES.find((m) => m === file.type) ?? null;
    if (!mimeType) {
      setPhotoError('Use a JPEG, PNG or WebP photo.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      // readAsDataURL always yields a string ("data:<mime>;base64,<data>").
      const result = typeof reader.result === 'string' ? reader.result : '';
      const base64 = result.split(',')[1] ?? '';
      if (!base64) {
        setPhotoError('Could not read that photo — try another one.');
        return;
      }
      setPhoto({ base64, mimeType, name: file.name });
    };
    reader.readAsDataURL(file);
  };

  const canSubmit =
    (tab === 'url' && /^https?:\/\/\S+\.\S+/.test(url.trim())) ||
    (tab === 'text' && text.trim().length >= 20) ||
    (tab === 'photo' && photo !== null);

  const handlePreview = () => {
    if (tab === 'url') previewMutation.mutate({ url: url.trim() });
    else if (tab === 'text') previewMutation.mutate({ text: text.trim() });
    else if (photo) previewMutation.mutate({ imageBase64: photo.base64, mimeType: photo.mimeType });
  };

  const handleSave = () => {
    if (!preview) return;
    const chosen = variant === 'adapted' ? preview.adapted : preview.original;
    saveMutation.mutate({
      recipe: chosen,
      variant,
      sourceUrl: preview.sourceUrl,
      ogImageUrl: preview.ogImageUrl,
    });
  };

  const adaptedUsable = preview ? preview.safety.ok && preview.changes.length > 0 : false;

  return (
    <Sheet
      open={open}
      onClose={handleClose}
      title="Import a recipe"
      description={
        preview
          ? undefined
          : 'Paste a link, paste the text, or snap a cookbook page — the chef imports it and adapts it to you.'
      }
      size="lg"
      footer={
        preview ? (
          isPremium ? (
            <div className="flex w-full items-center gap-3">
              <button
                onClick={reset}
                className="min-h-11 shrink-0 rounded-xl border px-4 text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                Back
              </button>
              <button
                onClick={handleSave}
                disabled={saveMutation.isPending}
                className="min-h-11 min-w-0 flex-1 rounded-xl bg-[#944a00] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#7a3d00] disabled:opacity-50"
              >
                {saveMutation.isPending
                  ? 'Saving…'
                  : variant === 'adapted'
                    ? 'Save Cheferized recipe'
                    : 'Save original recipe'}
              </button>
            </div>
          ) : undefined
        ) : (
          <button
            onClick={handlePreview}
            disabled={!canSubmit || previewMutation.isPending}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#944a00] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#7a3d00] disabled:opacity-50"
          >
            {previewMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Reading the recipe…
              </>
            ) : (
              'Preview import'
            )}
          </button>
        )
      }
    >
      {preview ? (
        <PreviewStep
          preview={preview}
          isPremium={isPremium}
          variant={variant}
          adaptedUsable={adaptedUsable}
          onVariantChange={setVariant}
          saveError={saveMutation.error?.message ?? null}
        />
      ) : (
        <div>
          {/* Source tabs */}
          <div className="mb-4 grid grid-cols-3 gap-1 rounded-xl bg-gray-100 p-1">
            {(
              [
                { key: 'url', label: 'Link', icon: Link2 },
                { key: 'text', label: 'Paste', icon: ClipboardType },
                { key: 'photo', label: 'Photo', icon: Camera },
              ] as const
            ).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                aria-pressed={tab === key}
                className={cn(
                  'flex min-h-11 items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition-colors',
                  tab === key ? 'bg-white text-[#944a00] shadow-sm' : 'text-gray-500',
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>

          {tab === 'url' && (
            <input
              type="url"
              inputMode="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://your-favourite-blog.com/best-pasta"
              className="w-full rounded-xl border bg-white px-4 py-3 text-sm text-gray-800 placeholder-gray-400 focus:border-[#944a00] focus:outline-none"
            />
          )}
          {tab === 'text' && (
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={7}
              placeholder="Paste the whole recipe — ingredients, steps, everything."
              className="w-full rounded-xl border bg-white px-4 py-3 text-sm text-gray-800 placeholder-gray-400 focus:border-[#944a00] focus:outline-none"
            />
          )}
          {tab === 'photo' && (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => handlePhotoPick(e.target.files?.[0])}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex min-h-24 w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-gray-50 px-4 py-6 text-sm text-gray-600 hover:border-[#944a00]"
              >
                <Camera className="h-6 w-6 text-gray-400" />
                {photo ? (
                  <span className="min-w-0 max-w-full truncate font-medium text-gray-800">
                    {photo.name}
                  </span>
                ) : (
                  <span>Snap or upload a cookbook page (max 4 MB)</span>
                )}
              </button>
              {photoError && <p className="mt-2 text-sm text-red-600">{photoError}</p>}
            </div>
          )}

          {isPremium === false && (
            <p className="mt-3 text-xs text-gray-500">
              Free preview: 1 import a day. Premium imports, adapts and saves up to 5 a day.
            </p>
          )}

          {previewMutation.isError && (
            <p className="mt-3 text-sm text-red-600">{previewMutation.error.message}</p>
          )}
        </div>
      )}
    </Sheet>
  );
}

// ─── Preview / diff step ──────────────────────────────────────────────────────

function PreviewStep({
  preview,
  isPremium,
  variant,
  adaptedUsable,
  onVariantChange,
  saveError,
}: {
  preview: ImportPreviewData;
  isPremium: boolean | undefined;
  variant: 'adapted' | 'original';
  adaptedUsable: boolean;
  onVariantChange: (v: 'adapted' | 'original') => void;
  saveError: string | null;
}) {
  return (
    <div className="space-y-4">
      {preview.macroCheck.status === 'uncertain' && (
        <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="min-w-0">
            {preview.macroCheck.computedCaloriesPerServing !== null ? (
              <>
                Calorie estimate uncertain — the page says{' '}
                {preview.macroCheck.statedCaloriesPerServing} kcal/serving, our ingredient data
                computes ~{preview.macroCheck.computedCaloriesPerServing} kcal.
              </>
            ) : (
              <>
                Calorie estimate uncertain — we couldn&apos;t verify the page&apos;s{' '}
                {preview.macroCheck.statedCaloriesPerServing} kcal/serving against our ingredient
                data. Treat the macros as approximate.
              </>
            )}
          </span>
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Original */}
        <RecipeCard
          label="Original"
          recipe={preview.original}
          selected={isPremium ? variant === 'original' : false}
          onSelect={isPremium ? () => onVariantChange('original') : undefined}
        />

        {/* Cheferized — blurred ghost state for free users */}
        <div className="relative min-w-0">
          <div
            className={cn(isPremium === false && 'pointer-events-none select-none blur-sm')}
            aria-hidden={isPremium === false}
          >
            <RecipeCard
              label="Cheferized for you"
              accent
              recipe={preview.adapted}
              changes={preview.changes}
              selected={isPremium ? variant === 'adapted' : false}
              disabled={!adaptedUsable}
              onSelect={isPremium && adaptedUsable ? () => onVariantChange('adapted') : undefined}
            />
          </div>
          {isPremium === false && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-2xl bg-white/40 p-4 text-center">
              <span className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-[#944a00] shadow-sm">
                <Sparkles className="h-4 w-4" />
                {preview.changes.length > 0
                  ? `${preview.changes.length} adaptation${preview.changes.length === 1 ? '' : 's'} for your preferences`
                  : 'Adapted to your preferences'}
              </span>
              <UpgradeButton source="recipe-import" />
            </div>
          )}
        </div>
      </div>

      {isPremium && !preview.safety.ok && (
        <p className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="min-w-0">
            The adaptation could not fully remove: {preview.safety.issues.join(', ')}. Only the
            original can be saved — review it carefully before cooking.
          </span>
        </p>
      )}

      {preview.sourceUrl && (
        <p className="truncate text-xs text-gray-400">
          Source: {preview.sourceUrl} — imported to your private collection only.
        </p>
      )}

      {saveError && <p className="text-sm text-red-600">{saveError}</p>}
    </div>
  );
}

function RecipeCard({
  label,
  recipe,
  changes,
  accent = false,
  selected = false,
  disabled = false,
  onSelect,
}: {
  label: string;
  recipe: RecipePayload;
  changes?: { kind: string; description: string }[];
  accent?: boolean;
  selected?: boolean;
  disabled?: boolean;
  onSelect?: (() => void) | undefined;
}) {
  const n = recipe.nutritionInfo;
  return (
    <div
      onClick={disabled ? undefined : onSelect}
      role={onSelect ? 'button' : undefined}
      className={cn(
        'min-w-0 rounded-2xl border bg-white p-4',
        accent && 'border-amber-200 bg-amber-50/40',
        selected && 'ring-2 ring-[#944a00]',
        onSelect && !disabled && 'cursor-pointer',
        disabled && 'opacity-60',
      )}
    >
      <p
        className={cn(
          'mb-1 text-[11px] font-semibold uppercase tracking-widest',
          accent ? 'text-[#944a00]' : 'text-gray-500',
        )}
      >
        {label}
      </p>
      <h3 className="font-serif text-base font-bold text-gray-900">{recipe.name}</h3>
      <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <Flame className="h-3 w-3 text-[#944a00]" />
          {n.calories} kcal
        </span>
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {recipe.prepTimeMins + recipe.cookTimeMins}m
        </span>
        <span className="flex items-center gap-1">
          <Users className="h-3 w-3" />
          {recipe.servings} servings
        </span>
      </div>

      {changes && changes.length > 0 && (
        <ul className="mt-3 space-y-1">
          {changes.map((change, i) => (
            <li key={i} className="flex items-start gap-1.5 text-xs text-gray-700">
              <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-[#944a00]" />
              <span className="min-w-0">{change.description}</span>
            </li>
          ))}
        </ul>
      )}

      <ul className="mt-3 space-y-0.5 text-xs text-gray-600">
        {recipe.ingredients.slice(0, 8).map((ing, i) => (
          <li key={i} className="truncate">
            {ing.quantity} {ing.unit} {ing.name}
          </li>
        ))}
        {recipe.ingredients.length > 8 && (
          <li className="text-gray-400">+{recipe.ingredients.length - 8} more</li>
        )}
      </ul>
    </div>
  );
}
