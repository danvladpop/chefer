import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { VIDEO_IMPORT_COPY } from '@chefer/types';
import { Button, Card, KeyboardAwareScrollView, Screen, Text } from '@chefer/ui-mobile';
import { cn, isSupportedVideoUrl } from '@chefer/utils';
import { useAiConsent } from '../src/features/ai-consent/ai-consent-provider';
import {
  VideoDraftForm,
  type VideoDraftRecipe,
  type VideoImportPreview,
} from '../src/features/recipes/video-draft-form';
import { useIsPremium } from '../src/hooks/use-is-premium';
import { trpc, type RouterOutputs } from '../src/lib/trpc';

// Recipe import (F5 Cheferize) — port of web's ImportRecipeSheet (wave-2b).
// Sources: URL, pasted text and a video link. Photo import lands with M3-2's
// image-picker work. Per-user AI is premium-only: free users see a locked
// card instead of the form, like web's locked example (the API answers
// FORBIDDEN anyway).
//
// Video links (2026-09-26): the API reads the video's words (caption,
// subtitles or speech) into a draft, and VideoDraftForm lets the user correct
// and complete it before it is saved as the original.

type Preview = RouterOutputs['recipe']['importPreview'];
type Variant = 'original' | 'adapted';
type SourceTab = 'url' | 'text' | 'video';

function VariantCard({
  title,
  recipe,
  selected,
  onSelect,
  note,
}: {
  title: string;
  recipe: Preview['original'];
  selected: boolean;
  onSelect?: (() => void) | undefined;
  note?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={!onSelect}
      onPress={onSelect}
      className={cn(
        'rounded-xl border p-3',
        selected ? 'border-primary bg-accent' : 'border-border bg-card',
        !onSelect && 'opacity-70',
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
        {recipe.nutritionInfo.calories} kcal · {recipe.ingredients.length} ingredients ·{' '}
        {recipe.prepTimeMins + recipe.cookTimeMins}m
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

  const previewMutation = trpc.recipe.importPreview.useMutation({
    onSuccess: (data) => {
      setPreview(data);
      setVariant(data.safety.ok && data.changes.length > 0 ? 'adapted' : 'original');
    },
  });
  const videoPreviewMutation = trpc.recipe.importVideoPreview.useMutation({
    onSuccess: (data) => setVideoPreview(data),
  });
  const saveMutation = trpc.recipe.importSave.useMutation({
    onSuccess: () => {
      void utils.recipe.list.invalidate();
      router.back();
    },
  });

  // AI data consent (App Store 5.1.2(i)): the link/text and the user's safety
  // preferences go to the AI provider — ask before the first import.
  const requestAiConsent = useAiConsent();
  const previewPending = previewMutation.isPending || videoPreviewMutation.isPending;
  const previewError = previewMutation.error ?? videoPreviewMutation.error;
  const videoUrlInvalid =
    tab === 'video' && videoUrl.trim() !== '' && !isSupportedVideoUrl(videoUrl);
  const canPreview =
    tab === 'url'
      ? url.trim() !== ''
      : tab === 'text'
        ? text.trim().length >= 20
        : isSupportedVideoUrl(videoUrl);

  const runPreview = () => {
    if (previewPending) {
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

  const saveVideoDraft = (recipe: VideoDraftRecipe) => {
    if (!videoPreview) {
      return;
    }
    // A reviewed draft is saved as-is: the `original` variant, no Cheferize.
    saveMutation.mutate({
      recipe,
      variant: 'original',
      sourceUrl: videoPreview.sourceUrl,
      ogImageUrl: videoPreview.ogImageUrl,
    });
  };
  const startOver = () => {
    setPreview(null);
    setVideoPreview(null);
    saveMutation.reset();
  };

  const adaptedUsable = preview ? preview.safety.ok && preview.changes.length > 0 : false;
  const chosen = preview ? (variant === 'adapted' ? preview.adapted : preview.original) : null;

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
        {isPremium === false ? (
          <Card testID="import-locked" className="border-primary/20 bg-accent">
            <Text className="text-sm font-semibold text-primary">Importing recipes is premium</Text>
            <Text className="mt-1 text-xs text-primary/80">
              Premium imports any recipe from a link, pasted text or a cooking video, adapts it to
              your allergies and household, and saves it to your collection.
            </Text>
            <Button
              testID="import-locked-upgrade"
              variant="outline"
              size="sm"
              className="mt-3 self-start"
              onPress={() =>
                router.push({ pathname: '/profile', params: { source: 'recipe-import' } })
              }
            >
              See Premium
            </Button>
          </Card>
        ) : videoPreview ? (
          <VideoDraftForm
            preview={videoPreview}
            saving={saveMutation.isPending}
            saveError={saveMutation.error?.message ?? null}
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
                  placeholder={VIDEO_IMPORT_COPY.urlPlaceholder}
                  placeholderTextColor="#9ca3af"
                  className="h-11 rounded-md border border-input bg-background px-3 text-base text-foreground"
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
                value={url}
                onChangeText={setUrl}
                autoCapitalize="none"
                keyboardType="url"
                placeholder="https://example.com/best-lasagna"
                placeholderTextColor="#9ca3af"
                className="h-11 rounded-md border border-input bg-background px-3 text-base text-foreground"
              />
            ) : (
              <TextInput
                testID="import-text"
                value={text}
                onChangeText={setText}
                multiline
                placeholder="Paste the full recipe text (ingredients + steps)…"
                placeholderTextColor="#9ca3af"
                className="min-h-40 rounded-md border border-input bg-background px-3 py-2 text-base text-foreground"
              />
            )}

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
                <Text className="text-sm text-red-600">{previewError.message}</Text>
              </Card>
            )}
          </>
        ) : (
          <>
            {/* Macro sanity warning (uncertain stated calories) */}
            {preview.macroCheck.status === 'uncertain' && (
              <Card className="border-amber-200 bg-amber-50">
                <Text className="text-xs text-amber-800">
                  The source claims {preview.macroCheck.statedCaloriesPerServing} kcal/serving
                  {preview.macroCheck.computedCaloriesPerServing !== null
                    ? `, but our ingredient data computes ~${preview.macroCheck.computedCaloriesPerServing} kcal`
                    : ' — we could not verify it against our ingredient data'}
                  .
                </Text>
              </Card>
            )}

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

            <VariantCard
              title="Original"
              recipe={preview.original}
              selected={variant === 'original'}
              onSelect={isPremium ? () => setVariant('original') : undefined}
            />
            <VariantCard
              title="Cheferized for you"
              recipe={preview.adapted}
              selected={variant === 'adapted'}
              onSelect={isPremium && adaptedUsable ? () => setVariant('adapted') : undefined}
              note={
                preview.changes.length > 0
                  ? preview.changes
                      .slice(0, 3)
                      .map((c) => c.description)
                      .join(' · ')
                  : 'No changes needed — already fits your profile.'
              }
            />

            <Button
              testID="import-save"
              loading={saveMutation.isPending}
              disabled={!chosen}
              onPress={() => {
                if (chosen) {
                  saveMutation.mutate({
                    recipe: chosen,
                    variant,
                    sourceUrl: preview.sourceUrl,
                    ogImageUrl: preview.ogImageUrl,
                  });
                }
              }}
            >
              {variant === 'adapted' ? 'Save Cheferized recipe' : 'Save original recipe'}
            </Button>
            {saveMutation.isError && (
              <Card className="border-red-200 bg-red-50">
                <Text className="text-sm text-red-600">{saveMutation.error.message}</Text>
              </Card>
            )}

            <Button variant="ghost" onPress={startOver}>
              <Text variant="muted" className="text-xs">
                Start over
              </Text>
            </Button>
          </>
        )}
      </KeyboardAwareScrollView>
    </Screen>
  );
}
