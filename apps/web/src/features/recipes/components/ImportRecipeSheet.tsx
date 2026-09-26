'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useAiConsent } from '@/features/ai-consent/AiConsentProvider';
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
  Video,
} from 'lucide-react';
import { VIDEO_IMPORT_COPY } from '@chefer/types';
import { Sheet } from '@chefer/ui';
import { cn, isSupportedVideoUrl } from '@chefer/utils';
import {
  VideoDraftForm,
  type VideoDraftRecipe,
  type VideoImportPreviewData,
} from './VideoDraftForm';

// ─── Cheferize Anything (F5) — import + diff sheet ───────────────────────────
// Free tier gets the real extraction preview (1/day, the §6.4 ghost state);
// the Cheferize diff renders blurred with the adaptation count visible and
// the upgrade CTA (source `recipe-import`). Premium sees the full diff and
// can save either variant. Copyright stance: personal collection only — the
// import keeps its source link and is never shown to other users.
//
// Video links (2026-09-26) take a different path: the API reads the video's
// words (caption, subtitles or speech) into a DRAFT, and VideoDraftForm lets
// the user correct and complete it before it is saved as the original.

type SourceTab = 'url' | 'text' | 'photo' | 'video';

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
  const [videoUrl, setVideoUrl] = useState('');
  const [preview, setPreview] = useState<ImportPreviewData | null>(null);
  const [videoPreview, setVideoPreview] = useState<VideoImportPreviewData | null>(null);
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

  const videoPreviewMutation = trpc.recipe.importVideoPreview.useMutation({
    onSuccess: (data) => {
      capture('recipe_imported', { via: 'video' });
      setVideoPreview(data);
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
    setVideoPreview(null);
    previewMutation.reset();
    videoPreviewMutation.reset();
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
    (tab === 'photo' && photo !== null) ||
    (tab === 'video' && isSupportedVideoUrl(videoUrl));
  const videoUrlInvalid =
    tab === 'video' && videoUrl.trim() !== '' && !isSupportedVideoUrl(videoUrl);

  // AI data consent (App Store 5.1.2(i)): the link/text/photo and the user's
  // safety preferences go to the AI provider — ask before the first import.
  const requestAiConsent = useAiConsent();
  const handlePreview = () => {
    requestAiConsent('recipe-import', () => {
      if (tab === 'video') videoPreviewMutation.mutate({ url: videoUrl.trim() });
      else if (tab === 'url') previewMutation.mutate({ url: url.trim() });
      else if (tab === 'text') previewMutation.mutate({ text: text.trim() });
      else if (photo)
        previewMutation.mutate({ imageBase64: photo.base64, mimeType: photo.mimeType });
    });
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

  const handleVideoSave = (recipe: VideoDraftRecipe) => {
    if (!videoPreview) return;
    // A reviewed draft is saved as-is: the `original` variant, no Cheferize.
    setVariant('original');
    saveMutation.mutate({
      recipe,
      variant: 'original',
      sourceUrl: videoPreview.sourceUrl,
      ogImageUrl: videoPreview.ogImageUrl,
    });
  };

  const previewPending = previewMutation.isPending || videoPreviewMutation.isPending;
  const previewError = previewMutation.error ?? videoPreviewMutation.error;
  const adaptedUsable = preview ? preview.safety.ok && preview.changes.length > 0 : false;

  return (
    <Sheet
      open={open}
      onClose={handleClose}
      title="Import a recipe"
      description={
        preview || videoPreview
          ? undefined
          : 'Paste a link or the text, snap a cookbook page, or share a cooking video — the chef imports it for you.'
      }
      size="lg"
      footer={
        isPremium === false ? (
          <UpgradeButton className="min-h-11 w-full" source="recipe-import" />
        ) : videoPreview ? undefined : preview ? (
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
            disabled={!canSubmit || previewPending}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#944a00] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#7a3d00] disabled:opacity-50"
          >
            {previewPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {tab === 'video' ? VIDEO_IMPORT_COPY.reading : 'Reading the recipe…'}
              </>
            ) : (
              'Preview import'
            )}
          </button>
        )
      }
    >
      {isPremium === false ? (
        <ImportLockedDemo />
      ) : videoPreview ? (
        <VideoDraftForm
          preview={videoPreview}
          saving={saveMutation.isPending}
          saveError={saveMutation.error?.message ?? null}
          onBack={reset}
          onSave={handleVideoSave}
        />
      ) : preview ? (
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
          <div className="mb-4 grid grid-cols-4 gap-1 rounded-xl bg-gray-100 p-1">
            {(
              [
                { key: 'url', label: 'Link', icon: Link2 },
                { key: 'text', label: 'Paste', icon: ClipboardType },
                { key: 'photo', label: 'Photo', icon: Camera },
                { key: 'video', label: VIDEO_IMPORT_COPY.tabLabel, icon: Video },
              ] as const
            ).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                aria-pressed={tab === key}
                className={cn(
                  'flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition-colors',
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

          {tab === 'video' && (
            <div>
              <p className="mb-2 text-sm text-gray-600">{VIDEO_IMPORT_COPY.intro}</p>
              <input
                type="url"
                inputMode="url"
                aria-label="Video link"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder={VIDEO_IMPORT_COPY.urlPlaceholder}
                aria-invalid={videoUrlInvalid || undefined}
                className="w-full rounded-xl border bg-white px-4 py-3 text-sm text-gray-800 placeholder-gray-400 focus:border-[#944a00] focus:outline-none"
              />
              {videoUrlInvalid && (
                <p className="mt-2 text-sm text-red-600">{VIDEO_IMPORT_COPY.unsupportedUrl}</p>
              )}
              <p className="mt-2 text-xs text-gray-500">{VIDEO_IMPORT_COPY.privacyNote}</p>
            </div>
          )}

          {previewError && <p className="mt-3 text-sm text-red-600">{previewError.message}</p>}
        </div>
      )}
    </Sheet>
  );
}

// ─── Locked demo (free tier) ──────────────────────────────────────────────────
// Recipe import is per-user AI, so it is premium-only (owner decision
// 2026-09-25). Free users see a clearly labelled, canned example of what the
// chef does — no AI call, no daily preview to burn.

const DEMO_CHANGES = [
  'Swapped peanut butter for toasted sunflower seed butter',
  'Swapped chicken for extra-firm tofu (vegetarian)',
  'Rescaled from 4 servings to 2',
];

function ImportLockedDemo() {
  return (
    <div className="space-y-4" data-testid="import-locked">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Example</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border bg-gray-50 p-3">
          <p className="text-xs font-semibold text-gray-500">Original</p>
          <p className="mt-1 text-sm font-semibold text-gray-900">Chicken Peanut Satay</p>
          <p className="mt-1 text-xs text-gray-600">From a food blog · serves 4</p>
        </div>
        <div className="rounded-xl border border-[#944a00]/30 bg-[#fff8f0] p-3">
          <p className="text-xs font-semibold text-[#944a00]">Cheferized for you</p>
          <p className="mt-1 text-sm font-semibold text-gray-900">Tofu Satay</p>
          <ul className="mt-1 space-y-0.5 text-xs text-gray-700">
            {DEMO_CHANGES.map((c) => (
              <li key={c}>· {c}</li>
            ))}
          </ul>
        </div>
      </div>
      <p className="flex items-start gap-2 text-sm text-gray-700">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
        Premium imports any recipe from a link, pasted text, a cookbook photo or a cooking video,
        adapts it to your allergies and household, and saves it to your collection.
      </p>
    </div>
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
          'mb-1 text-xs font-semibold uppercase tracking-widest',
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
