import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { VIDEO_IMPORT_COPY, type VideoDraftField } from '@chefer/types';
import { Badge, Button, Card, Input, Text } from '@chefer/ui-mobile';
import {
  cn,
  finalizeVideoDraft,
  videoDraftProblems,
  videoDraftToForm,
  videoFormToDraft,
  type VideoDraftFormValues,
} from '@chefer/utils';
import type { RouterOutputs } from '../../lib/trpc';

// Video import review form — port of web's VideoDraftForm. The AI reads the
// video's words into a draft; the user corrects it, fills what the video did
// not say ("Not found — please add"), then saves through importSave. The
// shared videoDraftProblems validates, so web, mobile and the API agree.

export type VideoImportPreview = RouterOutputs['recipe']['importVideoPreview'];
export type VideoDraftRecipe = VideoImportPreview['draft'];

type IngredientRow = VideoDraftFormValues['ingredients'][number];

function Label({ children }: { children: string }) {
  return <Text className="mb-1 text-xs font-medium text-gray-600">{children}</Text>;
}

export function VideoDraftForm({
  preview,
  saving,
  saveError,
  onBack,
  onSave,
}: {
  preview: VideoImportPreview;
  saving: boolean;
  saveError: string | null;
  onBack: () => void;
  onSave: (recipe: VideoDraftRecipe) => void;
}) {
  const [form, setForm] = useState<VideoDraftFormValues>(() => videoDraftToForm(preview.draft));
  const [touched, setTouched] = useState<Partial<Record<VideoDraftField, boolean>>>({});
  const [problems, setProblems] = useState<string[]>([]);
  const [unheard, setUnheard] = useState<boolean[]>(() =>
    preview.draft.ingredients.map((_, i) => preview.unverifiedQuantities.includes(i)),
  );

  const flagged = (field: VideoDraftField) => preview.notFound.includes(field);
  const update = (patch: Partial<VideoDraftFormValues>, field?: VideoDraftField) => {
    setForm((f) => ({ ...f, ...patch }));
    if (field) setTouched((t) => ({ ...t, [field]: true }));
    setProblems([]);
  };
  const setIngredient = (index: number, patch: Partial<IngredientRow>) => {
    update({
      ingredients: form.ingredients.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    });
    if (patch.quantity !== undefined) {
      setUnheard((u) => u.map((f, i) => (i === index ? false : f)));
    }
  };
  const removeIngredient = (index: number) => {
    update({ ingredients: form.ingredients.filter((_, i) => i !== index) });
    setUnheard((u) => u.filter((_, i) => i !== index));
  };

  const nameMissing = flagged('name') && !form.name.trim();
  const ingredientsMissing = flagged('ingredients') && !form.ingredients.some((i) => i.name.trim());
  const stepsMissing = flagged('instructions') && !form.instructions.some((s) => s.trim());
  const servingsUnstated = flagged('servings') && !touched.servings;
  const timeUnstated = flagged('time') && !touched.time;

  const handleSave = () => {
    const edited = videoFormToDraft(preview.draft, form);
    const found = videoDraftProblems(edited);
    setProblems(found);
    if (found.length === 0) onSave(finalizeVideoDraft(preview.draft, edited));
  };

  return (
    <View testID="video-draft-form" className="gap-4">
      <Card className="border-amber-200 bg-amber-50">
        <View className="flex-row items-start gap-2">
          <Ionicons name="information-circle" size={18} color="#92400e" />
          <View className="min-w-0 flex-1">
            <Text className="text-sm font-semibold text-amber-900">
              {VIDEO_IMPORT_COPY.checkTitle}
            </Text>
            <Text className="mt-0.5 text-xs text-amber-900">
              {VIDEO_IMPORT_COPY.checkBody[preview.transcriptSource]}
            </Text>
          </View>
        </View>
      </Card>

      {!preview.safety.ok && (
        <Card testID="video-draft-unsafe" className="border-red-200 bg-red-50">
          <Text className="text-xs text-red-700">
            This recipe conflicts with your household&apos;s allergies or diet (
            {preview.safety.issues.join(', ')}). Edit those ingredients before cooking it.
          </Text>
        </Card>
      )}

      <View>
        <Label>Recipe name</Label>
        {nameMissing && (
          <Badge variant="destructive" className="mb-1">
            {VIDEO_IMPORT_COPY.notFound}
          </Badge>
        )}
        <Input
          testID="video-draft-name"
          accessibilityLabel="Recipe name"
          value={form.name}
          maxLength={120}
          onChangeText={(name) => update({ name })}
          className={cn(nameMissing && 'border-red-400')}
        />
      </View>

      <View className="flex-row gap-2">
        {(
          [
            ['servings', 'Servings', form.servings, 'servings'],
            ['prepTimeMins', 'Prep (min)', form.prepTimeMins, 'time'],
            ['cookTimeMins', 'Cook (min)', form.cookTimeMins, 'time'],
          ] as const
        ).map(([key, label, value, field]) => (
          <View key={key} className="min-w-0 flex-1">
            <Label>{label}</Label>
            <Input
              testID={`video-draft-${key}`}
              accessibilityLabel={label}
              value={value}
              keyboardType="number-pad"
              onChangeText={(text) => update({ [key]: text }, field)}
            />
          </View>
        ))}
      </View>
      {(servingsUnstated || timeUnstated) && (
        <View className="-mt-2 flex-row flex-wrap gap-2">
          {servingsUnstated && (
            <Badge variant="warning">{`Servings: ${VIDEO_IMPORT_COPY.notStated.toLowerCase()}`}</Badge>
          )}
          {timeUnstated && (
            <Badge variant="warning">{`Time: ${VIDEO_IMPORT_COPY.notStated.toLowerCase()}`}</Badge>
          )}
        </View>
      )}

      <View>
        <View className="mb-2 flex-row flex-wrap items-center gap-2">
          <Text className="text-sm font-semibold text-gray-900">Ingredients</Text>
          {ingredientsMissing && <Badge variant="destructive">{VIDEO_IMPORT_COPY.notFound}</Badge>}
        </View>
        <View className="gap-2">
          {form.ingredients.map((row, index) => (
            <View key={index}>
              <View className="flex-row items-center gap-2">
                <Input
                  testID={`video-draft-qty-${index}`}
                  accessibilityLabel={`Amount for ingredient ${index + 1}`}
                  value={row.quantity}
                  placeholder="Qty"
                  keyboardType="decimal-pad"
                  onChangeText={(quantity) => setIngredient(index, { quantity })}
                  className={cn('w-16', unheard[index] && 'border-amber-400')}
                />
                <Input
                  testID={`video-draft-unit-${index}`}
                  accessibilityLabel={`Unit for ingredient ${index + 1}`}
                  value={row.unit}
                  placeholder="g"
                  maxLength={20}
                  autoCapitalize="none"
                  onChangeText={(unit) => setIngredient(index, { unit })}
                  className="w-16"
                />
                <Input
                  testID={`video-draft-ingredient-${index}`}
                  accessibilityLabel={`Ingredient ${index + 1}`}
                  value={row.name}
                  placeholder="Ingredient"
                  maxLength={80}
                  onChangeText={(name) => setIngredient(index, { name })}
                  className={cn('min-w-0 flex-1', ingredientsMissing && 'border-red-400')}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ingredient ${index + 1}`}
                  onPress={() => removeIngredient(index)}
                  className="h-11 w-11 items-center justify-center"
                >
                  <Ionicons name="close" size={18} color="#9ca3af" />
                </Pressable>
              </View>
              {unheard[index] && (
                <Text className="mt-1 text-xs text-amber-800">
                  {VIDEO_IMPORT_COPY.quantityCheck}
                </Text>
              )}
            </View>
          ))}
        </View>
        <Button
          testID="video-draft-add-ingredient"
          variant="ghost"
          size="sm"
          className="mt-1 self-start"
          onPress={() =>
            update({ ingredients: [...form.ingredients, { quantity: '', unit: '', name: '' }] })
          }
        >
          + Add ingredient
        </Button>
      </View>

      <View>
        <View className="mb-2 flex-row flex-wrap items-center gap-2">
          <Text className="text-sm font-semibold text-gray-900">Steps</Text>
          {stepsMissing && <Badge variant="destructive">{VIDEO_IMPORT_COPY.notFound}</Badge>}
        </View>
        <View className="gap-2">
          {form.instructions.map((step, index) => (
            <View key={index} className="flex-row items-start gap-2">
              <Text className="mt-3 w-5 text-right text-xs font-semibold text-gray-500">
                {index + 1}.
              </Text>
              <TextInput
                testID={`video-draft-step-${index}`}
                accessibilityLabel={`Step ${index + 1}`}
                value={step}
                multiline
                maxLength={500}
                placeholderTextColor="#9ca3af"
                onChangeText={(text) =>
                  update({
                    instructions: form.instructions.map((s, i) => (i === index ? text : s)),
                  })
                }
                className={cn(
                  'min-h-16 min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-base text-foreground',
                  stepsMissing && 'border-red-400',
                )}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove step ${index + 1}`}
                onPress={() =>
                  update({ instructions: form.instructions.filter((_, i) => i !== index) })
                }
                className="h-11 w-11 items-center justify-center"
              >
                <Ionicons name="close" size={18} color="#9ca3af" />
              </Pressable>
            </View>
          ))}
        </View>
        <Button
          testID="video-draft-add-step"
          variant="ghost"
          size="sm"
          className="mt-1 self-start"
          onPress={() => update({ instructions: [...form.instructions, ''] })}
        >
          + Add step
        </Button>
      </View>

      {preview.assumptions.length > 0 && (
        <Card className="bg-gray-50">
          <Text className="text-xs font-semibold text-gray-600">What we guessed</Text>
          {preview.assumptions.map((a) => (
            <Text key={a} className="mt-0.5 text-xs text-gray-600">
              • {a}
            </Text>
          ))}
        </Card>
      )}

      <Text variant="muted" className="text-xs">
        {VIDEO_IMPORT_COPY.nutritionNote} Saved to your private collection only.
      </Text>

      {(problems.length > 0 || saveError) && (
        <Card testID="video-draft-problems" className="border-red-200 bg-red-50">
          {problems.map((p) => (
            <Text key={p} className="text-sm text-red-700">
              {p}
            </Text>
          ))}
          {saveError && <Text className="text-sm text-red-700">{saveError}</Text>}
        </Card>
      )}

      <Button testID="video-draft-save" loading={saving} onPress={handleSave}>
        Save recipe
      </Button>
      <Button variant="ghost" onPress={onBack}>
        <Text variant="muted" className="text-xs">
          Start over
        </Text>
      </Button>
    </View>
  );
}
