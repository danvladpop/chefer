import { useState } from 'react';
import { Keyboard, Pressable, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { FRIENDS_COPY, VIDEO_IMPORT_COPY } from '@chefer/types';
import {
  Button,
  Card,
  ConfirmSheet,
  KeyboardAwareScrollView,
  Screen,
  Text,
  useKeyboardDoneBar,
  useSnackbar,
} from '@chefer/ui-mobile';
import { cn, isSupportedVideoUrl, PREMIUM_PITCH_COPY, userFacingErrorMessage } from '@chefer/utils';
import { useAiConsent } from '../src/features/ai-consent/ai-consent-provider';
import { textRejectedOf } from '../src/features/friends/api/friends-errors';
import { LockedFeatureCard } from '../src/features/premium/locked-feature-card';
import { openPremium } from '../src/features/premium/open-premium';
import { recipeFormCopy } from '../src/features/recipes/form/copy';
import {
  VideoDraftForm,
  type VideoImportPreview,
  type VideoSaveRecipe,
} from '../src/features/recipes/video-draft-form';
import { useIsPremium } from '../src/hooks/use-is-premium';
import { trpc, type RouterOutputs } from '../src/lib/trpc';
import { useUnsavedGuard } from '../src/lib/use-unsaved-guard';

// Recipe import (F5 Cheferize) — port of web's ImportRecipeSheet (wave-2b).
// Sources: URL, pasted text and a video link. Photo import lands with M3-2's
// image-picker work. Per-user AI is premium-only: free users keep the form
// (T-10.4) with a lock card above it; "Preview import" opens the job-led
// premium sheet instead of calling the API (which would answer FORBIDDEN).
//
// Video links (2026-09-26): the API reads the video's words (caption,
// subtitles or speech) into a draft, and VideoDraftForm lets the user correct
// and complete it before it is saved as the original.
//
// UX-REC-15: link and text imports review in the SAME editable form as video
// (VideoDraftForm), seeded with the chosen version — Original, or Cheferized
// when the adaptation changed something and is safe. UX-REC-14: when there is
// no second version to choose, "Cheferized for you" is a note, not a disabled
// card that looks selectable. UX-REC-07: Save replaces this screen with the
// new recipe (no jump back to an unrelated screen).
//
// plan-ingredient-catalog §6.2/§10: nutrition is computed from the catalog,
// never the AI. The form lists the lines the resolver couldn't match, with
// candidates, the catalog search and "Create … as my ingredient"; the save
// sends each line's `ingredientId` and `acceptPartial` — false when every
// line computes, true only after "Save with incomplete nutrition?".

type Preview = RouterOutputs['recipe']['importPreview'];
type Variant = 'original' | 'adapted';
type SourceTab = 'url' | 'text' | 'video';

function VariantCard({
  title,
  recipe,
  selected,
  onSelect,
  note,
  testID,
}: {
  title: string;
  recipe: Preview['original'];
  selected: boolean;
  onSelect: () => void;
  note?: string;
  testID: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="radio"
      accessibilityState={{ selected, checked: selected }}
      accessibilityLabel={title}
      onPress={onSelect}
      className={cn(
        'min-h-11 rounded-xl border p-3',
        selected ? 'border-primary bg-accent' : 'border-border bg-card',
      )}
    >
      <View className="flex-row items-center justify-between">
        <Text className={cn('text-sm font-semibold', selected ? 'text-primary' : 'text-gray-800')}>
          {title}
        </Text>
        {selected && <Ionicons name="checkmark-circle" size={18} color="#944a00" />}
      </View>
      <Text numberOfLines={1} className="mt-1 text-sm text-gray-800">
        {recipe.name}
      </Text>
      <Text className="text-xs text-gray-500">
        {recipe.ingredients.length} ingredients · {recipe.prepTimeMins + recipe.cookTimeMins}m
      </Text>
      {note && (
        <Text variant="muted" className="mt-1 text-xs">
          {note}
        </Text>
      )}
    </Pressable>
  );
}

export default function ImportRecipeScreen() {
  const isPremium = useIsPremium();
  const utils = trpc.useUtils();

  const [tab, setTab] = useState<SourceTab>('url');
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [videoPreview, setVideoPreview] = useState<VideoImportPreview | null>(null);
  const [variant, setVariant] = useState<Variant>('adapted');
  const snackbar = useSnackbar();

  // UX-REC-06: a finished AI preview (link/text or video) is work the user paid
  // a request for — BACK, the header arrow or the iOS swipe ask before it is
  // thrown away. "Start over" clears the preview, which lifts the guard.
  const guard = useUnsavedGuard(preview !== null || videoPreview !== null, {
    title: 'Discard this import?',
    message: 'The recipe preview will be lost and you will need to import it again.',
    discardLabel: 'Discard',
    keepLabel: 'Keep reviewing',
  });

  const previewMutation = trpc.recipe.importPreview.useMutation({
    meta: { silent: true },
    onSuccess: (data) => {
      setPreview(data);
      setVariant(data.safety.ok && data.changes.length > 0 ? 'adapted' : 'original');
    },
  });
  const videoPreviewMutation = trpc.recipe.importVideoPreview.useMutation({
    meta: { silent: true },
    onSuccess: (data) => setVideoPreview(data),
  });
  const saveMutation = trpc.recipe.importSave.useMutation({
    meta: { silent: true },
    onSuccess: (saved) => {
      void utils.recipe.list.invalidate();
      guard.release();
      snackbar.show({ message: recipeFormCopy.save.saved, tone: 'success' });
      // UX-REC-07: land on the recipe just saved, not on whatever is below.
      router.replace({ pathname: '/recipe/[id]', params: { id: saved.id } });
    },
  });

  // AI data consent (App Store 5.1.2(i)): the link/text and the user's safety
  // preferences go to the AI provider — ask before the first import.
  const requestAiConsent = useAiConsent();
  const previewPending = previewMutation.isPending || videoPreviewMutation.isPending;
  // Following (PRD §9.4): a shared recipe whose name/description trips the
  // word filter → `data.textRejected: 'recipe'`. The video review shows it
  // under its name field; the link/text review (no name field) in its card.
  const saveTextRejected = saveMutation.isError && textRejectedOf(saveMutation.error) === 'recipe';
  const previewError = previewMutation.error ?? videoPreviewMutation.error;
  const videoUrlInvalid =
    tab === 'video' && videoUrl.trim() !== '' && !isSupportedVideoUrl(videoUrl);
  const canPreview =
    tab === 'url'
      ? url.trim() !== ''
      : tab === 'text'
        ? text.trim().length >= 20
        : isSupportedVideoUrl(videoUrl);

  const textDone = useKeyboardDoneBar();

  const runPreview = () => {
    if (previewPending) {
      return;
    }
    Keyboard.dismiss();
    // Free: importing is Premium. Nothing is sent (no consent needed, no
    // request made) — the sheet opens and the pasted content stays put.
    if (isPremium === false) {
      openPremium('recipe-import');
      return;
    }
    if (tab === 'video' && isSupportedVideoUrl(videoUrl)) {
      const input = { url: videoUrl.trim() };
      requestAiConsent('recipe-import', () => videoPreviewMutation.mutate(input));
    } else if (tab === 'url' && url.trim()) {
      const input = { url: url.trim() };
      requestAiConsent('recipe-import', () => previewMutation.mutate(input));
    } else if (tab === 'text' && text.trim().length >= 20) {
      const input = { text: text.trim() };
      requestAiConsent('recipe-import', () => previewMutation.mutate(input));
    }
  };

  const saveVideoDraft = (recipe: VideoSaveRecipe, acceptPartial: boolean) => {
    if (!videoPreview) {
      return;
    }
    // A reviewed draft is saved as-is: the `original` variant, no Cheferize.
    saveMutation.mutate({
      recipe,
      variant: 'original',
      sourceUrl: videoPreview.sourceUrl,
      ogImageUrl: videoPreview.ogImageUrl,
      acceptPartial,
    });
  };
  const startOver = () => {
    setPreview(null);
    setVideoPreview(null);
    saveMutation.reset();
  };

  const adaptedUsable = preview ? preview.safety.ok && preview.changes.length > 0 : false;
  const chosen = preview ? (variant === 'adapted' ? preview.adapted : preview.original) : null;

  /** The editable form saves the reviewed recipe as the chosen variant. */
  const saveChosen = (recipe: VideoSaveRecipe, acceptPartial: boolean) => {
    if (!preview) return;
    saveMutation.mutate({
      recipe,
      variant,
      sourceUrl: preview.sourceUrl,
      ogImageUrl: preview.ogImageUrl,
      acceptPartial,
    });
  };

  return (
    <Screen edges={['top', 'bottom', 'left', 'right']} className="px-0">
      <View className="flex-row items-center gap-3 px-4 py-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          className="h-11 w-11 items-center justify-center"
        >
          <Ionicons name="arrow-back" size={20} color="#1f2937" />
        </Pressable>
        <Text testID="import-title" variant="title">
          Import Recipe
        </Text>
      </View>

      <KeyboardAwareScrollView contentContainerClassName="gap-4 px-4 pb-8">
        {/* T-10.4 (UX-10 §5): on free the form stays visible — a lock card sits
            above it, "Import" opens the premium sheet, and what was pasted
            survives the sheet. "Or type it in yourself" is the free path. */}
        {isPremium === false && (
          <LockedFeatureCard
            testID="import-locked"
            source="recipe-import"
            freeAction={{
              label: PREMIUM_PITCH_COPY.importFreePath,
              onPress: () => router.push('/recipe-form'),
            }}
          />
        )}
        {videoPreview ? (
          <VideoDraftForm
            preview={videoPreview}
            saving={saveMutation.isPending}
            saveError={
              saveTextRejected
                ? null
                : ((saveMutation.error ? userFacingErrorMessage(saveMutation.error) : undefined) ??
                  null)
            }
            nameError={saveTextRejected ? FRIENDS_COPY.recipe.textRejected : null}
            onBack={startOver}
            onSave={saveVideoDraft}
          />
        ) : !preview ? (
          <>
            <Text variant="muted" className="text-sm">
              Paste a recipe link, its text or a cooking video — the chef extracts it and adapts it
              to your dietary needs.
            </Text>

            {/* Source tabs */}
            <View className="flex-row rounded-lg border border-border p-1">
              {(
                [
                  ['url', 'Link'],
                  ['text', 'Paste text'],
                  ['video', VIDEO_IMPORT_COPY.tabLabel],
                ] as const
              ).map(([key, label]) => (
                <Pressable
                  key={key}
                  testID={`import-tab-${key}`}
                  accessibilityRole="button"
                  onPress={() => setTab(key)}
                  className={cn(
                    'h-10 flex-1 items-center justify-center rounded-md',
                    tab === key && 'bg-primary',
                  )}
                >
                  <Text
                    className={cn(
                      'text-sm font-medium',
                      tab === key ? 'text-primary-foreground' : 'text-gray-600',
                    )}
                  >
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {tab === 'video' ? (
              <View className="gap-2">
                <Text variant="muted" className="text-sm">
                  {VIDEO_IMPORT_COPY.intro}
                </Text>
                <TextInput
                  testID="import-video-url"
                  accessibilityLabel="Video link"
                  value={videoUrl}
                  onChangeText={setVideoUrl}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  returnKeyType="go"
                  onSubmitEditing={() => canPreview && runPreview()}
                  placeholder={VIDEO_IMPORT_COPY.urlPlaceholder}
                  placeholderTextColor="#9ca3af"
                  className="min-h-11 py-2 rounded-md border border-input bg-background px-3 text-base text-foreground"
                />
                {videoUrlInvalid && (
                  <Text testID="import-video-invalid" className="text-sm text-red-600">
                    {VIDEO_IMPORT_COPY.unsupportedUrl}
                  </Text>
                )}
                <Text variant="muted" className="text-xs">
                  {VIDEO_IMPORT_COPY.privacyNote}
                </Text>
              </View>
            ) : tab === 'url' ? (
              <TextInput
                testID="import-url"
                accessibilityLabel="Recipe link"
                value={url}
                onChangeText={(v) => {
                  // bug B-17: pasting a video link into the plain Link tab
                  // used to run it through the wrong (page-text) extractor.
                  // Detect a supported video URL and switch to the video
                  // flow, keeping what was typed.
                  if (isSupportedVideoUrl(v)) {
                    setTab('video');
                    setVideoUrl(v);
                    setUrl('');
                    return;
                  }
                  setUrl(v);
                }}
                autoCapitalize="none"
                keyboardType="url"
                returnKeyType="go"
                onSubmitEditing={() => canPreview && runPreview()}
                placeholder="https://example.com/best-lasagna"
                placeholderTextColor="#9ca3af"
                className="min-h-11 py-2 rounded-md border border-input bg-background px-3 text-base text-foreground"
              />
            ) : (
              <TextInput
                testID="import-text"
                accessibilityLabel="Recipe text"
                value={text}
                onChangeText={setText}
                multiline
                inputAccessoryViewID={textDone.inputAccessoryViewID}
                placeholder="Paste the full recipe text (ingredients + steps)…"
                placeholderTextColor="#9ca3af"
                className="min-h-40 rounded-md border border-input bg-background px-3 py-2 text-base text-foreground"
              />
            )}
            {textDone.bar}

            <Button
              testID="import-preview"
              loading={previewPending}
              disabled={!canPreview}
              onPress={runPreview}
            >
              {previewPending
                ? tab === 'video'
                  ? VIDEO_IMPORT_COPY.reading
                  : 'Extracting…'
                : 'Preview import'}
            </Button>
            {previewError && (
              <Card testID="import-error" className="border-red-200 bg-red-50">
                <Text className="text-sm text-red-600">{userFacingErrorMessage(previewError)}</Text>
              </Card>
            )}
          </>
        ) : (
          <>
            {isPremium && !preview.safety.ok && (
              // Parity with web ImportRecipeSheet: the adaptation left an
              // allergen or restriction in, so only the original can be saved
              // — say so instead of silently selecting it (F-M-REC-4-1).
              <Card testID="import-unsafe" className="border-red-200 bg-red-50">
                <View className="flex-row items-start gap-2">
                  <Ionicons name="warning" size={16} color="#b91c1c" style={{ marginTop: 2 }} />
                  <Text className="min-w-0 flex-1 text-xs text-red-700">
                    The adaptation could not fully remove: {preview.safety.issues.join(', ')}. Only
                    the original can be saved — review it carefully before cooking.
                  </Text>
                </View>
              </Card>
            )}

            {isPremium && adaptedUsable ? (
              // Two real versions: pick the one to review and save.
              <View testID="import-variants" accessibilityRole="radiogroup" className="gap-2">
                <VariantCard
                  testID="import-variant-original"
                  title="Original"
                  recipe={preview.original}
                  selected={variant === 'original'}
                  onSelect={() => setVariant('original')}
                />
                <VariantCard
                  testID="import-variant-adapted"
                  title="Cheferized for you"
                  recipe={preview.adapted}
                  selected={variant === 'adapted'}
                  onSelect={() => setVariant('adapted')}
                  note={preview.changes
                    .slice(0, 3)
                    .map((c) => c.description)
                    .join(' · ')}
                />
                <Text variant="muted" className="text-xs">
                  Switching version restarts the review below.
                </Text>
              </View>
            ) : isPremium && preview.safety.ok ? (
              // UX-REC-14: nothing to choose — a note, not a disabled card.
              <Card testID="import-no-changes" className="bg-gray-50">
                <Text className="text-xs text-gray-700">
                  Cheferized for you: no changes needed — this recipe already fits your profile.
                </Text>
              </Card>
            ) : null}

            {chosen ? (
              <VideoDraftForm
                key={variant}
                preview={{
                  draft: chosen,
                  resolution: preview.resolution[variant],
                  // The unsafe card above already says what the adaptation could not remove.
                  safety: { ok: true, issues: [] },
                }}
                saving={saveMutation.isPending}
                saveError={
                  saveTextRejected
                    ? null
                    : ((saveMutation.error
                        ? userFacingErrorMessage(saveMutation.error)
                        : undefined) ?? null)
                }
                nameError={saveTextRejected ? FRIENDS_COPY.recipe.textRejected : null}
                saveLabel={
                  variant === 'adapted' ? 'Save Cheferized recipe' : 'Save original recipe'
                }
                onBack={startOver}
                onSave={saveChosen}
              />
            ) : null}
          </>
        )}
      </KeyboardAwareScrollView>

      <ConfirmSheet testID="import-discard" {...guard.sheetProps} />
    </Screen>
  );
}
