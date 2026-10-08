'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useAiConsent } from '@/features/ai-consent/AiConsentProvider';
import { UpgradeButton } from '@/features/premium/components/UpgradeButton';
import { useEntitlement } from '@/hooks/useEntitlement';
import { capture } from '@/lib/analytics';
import { trpc, type RouterOutputs } from '@/lib/trpc';
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
import {
  cn,
  isSupportedVideoUrl,
  PREMIUM_PITCH_COPY,
  premiumPitchFor,
  userFacingErrorMessage,
} from '@chefer/utils';
import { useLiveNutrition, type LiveNutrition } from '../hooks/useLiveNutrition';
import { rowsFromImport, type LineRow } from '../lib/recipe-lines';
import {
  VideoDraftForm,
  type VideoDraftRecipe,
  type VideoImportPreviewData,
} from './VideoDraftForm';

// ─── Cheferize Anything (F5) — import + diff sheet ───────────────────────────
// Per-user AI is premium-only (owner decision 2026-09-25): a free user keeps
// the form (T-10.4) with a lock card above it and the job-led premium dialog
// behind "Preview import" (source `recipe-import`) — no API call, so no daily
// preview is burned. Premium sees the full diff and can save either variant. Copyright stance: personal collection only — the
// import keeps its source link and is never shown to other users.
//
// Video links (2026-09-26) take a different path: the API reads the video's
// words (caption, subtitles or speech) into a DRAFT, and VideoDraftForm lets
// the user correct and complete it before it is saved as the original.
//
// UX-REC-15 (web twin of the phone's import review): a link, pasted text or
// photo is reviewed in the SAME editable form. Choose the version (Original or
// Cheferized), then fix the name, amounts, units, matches and steps inline;
// Save sends the chosen variant and `acceptPartial`. Switching version restarts
// the review (the form is keyed by the variant).

type SourceTab = 'url' | 'text' | 'photo' | 'video';

type ImportPreviewData = RouterOutputs['recipe']['importPreview'];
type Variant = 'adapted' | 'original';

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
  const importPitch = premiumPitchFor('recipe-import');

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
  const [variant, setVariant] = useState<Variant>('adapted');
  // The imported lines per variant, only to show each version's computed kcal on
  // its card; the review form below owns the editable copy (§6.2).
  const [lines, setLines] = useState<Record<Variant, LineRow[]> | null>(null);
  const liveOriginal = useLiveNutrition(lines?.original ?? [], preview?.original.servings ?? 1);
  const liveAdapted = useLiveNutrition(lines?.adapted ?? [], preview?.adapted.servings ?? 1);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const previewMutation = trpc.recipe.importPreview.useMutation({
    meta: { silent: true },
    onSuccess: (data) => {
      capture('recipe_imported', { via: data.via });
      if (isPremium === false) capture('teaser_engaged', { feature: 'import' });
      setVariant(data.safety.ok && data.changes.length > 0 ? 'adapted' : 'original');
      setLines({
        original: rowsFromImport(data.original.ingredients, data.resolution.original),
        adapted: rowsFromImport(data.adapted.ingredients, data.resolution.adapted),
      });
      setPreview(data);
    },
  });

  const videoPreviewMutation = trpc.recipe.importVideoPreview.useMutation({
    meta: { silent: true },
    onSuccess: (data) => {
      capture('recipe_imported', { via: 'video' });
      setVideoPreview(data);
    },
  });

  const saveMutation = trpc.recipe.importSave.useMutation({
    meta: { silent: true },
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
    setLines(null);
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

  /** The editable review saves the reviewed recipe as the chosen variant. */
  const handleReviewSave = (recipe: VideoDraftRecipe, opts: { acceptPartial: boolean }) => {
    if (!preview) return;
    saveMutation.mutate({
      recipe,
      variant,
      sourceUrl: preview.sourceUrl,
      ogImageUrl: preview.ogImageUrl,
      acceptPartial: opts.acceptPartial,
    });
  };

  const handleVideoSave = (recipe: VideoDraftRecipe, opts: { acceptPartial: boolean }) => {
    if (!videoPreview) return;
    // A reviewed draft is saved as-is: the `original` variant, no Cheferize.
    setVariant('original');
    saveMutation.mutate({
      recipe,
      variant: 'original',
      sourceUrl: videoPreview.sourceUrl,
      ogImageUrl: videoPreview.ogImageUrl,
      acceptPartial: opts.acceptPartial,
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
          <UpgradeButton
            className="min-h-11 w-full"
            source="recipe-import"
            label="Preview import"
          />
        ) : videoPreview || preview ? undefined : (
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
      {videoPreview ? (
        <VideoDraftForm
          preview={videoPreview}
          saving={saveMutation.isPending}
          saveError={
            (saveMutation.error ? userFacingErrorMessage(saveMutation.error) : undefined) ?? null
          }
          onBack={reset}
          onSave={handleVideoSave}
        />
      ) : preview && lines ? (
        <PreviewStep
          preview={preview}
          isPremium={isPremium}
          variant={variant}
          adaptedUsable={adaptedUsable}
          onVariantChange={setVariant}
          live={{ original: liveOriginal, adapted: liveAdapted }}
          saving={saveMutation.isPending}
          saveError={
            (saveMutation.error ? userFacingErrorMessage(saveMutation.error) : undefined) ?? null
          }
          onBack={reset}
          onSave={handleReviewSave}
        />
      ) : (
        <div>
          {/* T-10.4/T-10.5 (UX-10 §5): on free the form stays — the lock is one
              card above it, "Preview import" opens the job-led premium dialog
              instead of calling the API, and what was pasted is still here
              afterwards. "Or type it in yourself" is the free path. */}
          {isPremium === false && (
            <div
              data-testid="import-locked"
              className="mb-4 rounded-xl border border-amber-200 bg-amber-50/60 p-3"
            >
              <p className="text-xs font-semibold uppercase tracking-widest text-[#944a00]">
                {PREMIUM_PITCH_COPY.eyebrow}
              </p>
              <p className="mt-1 text-sm font-semibold text-gray-900">{importPitch.headline}</p>
              <p className="mt-0.5 text-sm text-gray-600">{importPitch.lede}</p>
              <Link
                href="/recipes/new"
                onClick={onClose}
                className="mt-1 flex min-h-11 items-center text-sm font-semibold text-[#944a00] underline-offset-2 hover:underline"
              >
                {PREMIUM_PITCH_COPY.importFreePath}
              </Link>
            </div>
          )}
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

          {previewError && (
            <p className="mt-3 text-sm text-red-600">{userFacingErrorMessage(previewError)}</p>
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
  live,
  saving,
  saveError,
  onBack,
  onSave,
}: {
  preview: ImportPreviewData;
  isPremium: boolean | undefined;
  variant: Variant;
  adaptedUsable: boolean;
  onVariantChange: (v: Variant) => void;
  live: Record<Variant, LiveNutrition>;
  saving: boolean;
  saveError: string | null;
  onBack: () => void;
  onSave: (recipe: VideoDraftRecipe, opts: { acceptPartial: boolean }) => void;
}) {
  // Free users can only see the original.
  const shown: Variant = isPremium && variant === 'adapted' ? 'adapted' : 'original';
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Original */}
        <RecipeCard
          label="Original"
          recipe={preview.original}
          calories={live.original.status === 'EMPTY' ? null : live.original.perServing.calories}
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
              calories={live.adapted.status === 'EMPTY' ? null : live.adapted.perServing.calories}
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

      {isPremium && adaptedUsable && (
        <p className="text-xs text-gray-500">Switching version restarts the review below.</p>
      )}

      {/* UX-REC-15: the chosen version in the editable review form — every
          ingredient, amount, unit and step can be fixed before Save. Free users
          can only look (the footer's upgrade button replaces Save). */}
      {isPremium !== false && (
        <VideoDraftForm
          key={shown}
          preview={{
            draft: shown === 'adapted' ? preview.adapted : preview.original,
            resolution: preview.resolution[shown],
            // The notice above already says what the adaptation could not remove.
            safety: { ok: true, issues: [] },
            sourceUrl: preview.sourceUrl,
          }}
          saving={saving}
          saveError={saveError}
          saveLabel={shown === 'adapted' ? 'Save Cheferized recipe' : 'Save original recipe'}
          onBack={onBack}
          onSave={onSave}
        />
      )}
    </div>
  );
}

function RecipeCard({
  label,
  recipe,
  calories,
  changes,
  accent = false,
  selected = false,
  disabled = false,
  onSelect,
}: {
  label: string;
  recipe: RecipePayload;
  /** Live computed kcal per serving (null while there is nothing to compute). */
  calories: number | null;
  changes?: { kind: string; description: string }[];
  accent?: boolean;
  selected?: boolean;
  disabled?: boolean;
  onSelect?: (() => void) | undefined;
}) {
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
          {calories ?? recipe.nutritionInfo.calories} kcal
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
