import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { INGREDIENT_CATALOG_COPY, VIDEO_IMPORT_COPY, type VideoDraftField } from '@chefer/types';
import {
  Badge,
  Button,
  Card,
  ConfirmSheet,
  haptics,
  Input,
  PressableScale,
  SelectField,
  Text,
  type SelectOption,
} from '@chefer/ui-mobile';
import {
  cn,
  finalizeVideoDraft,
  incompleteLineCount,
  ingredientUnitGroups,
  parseQuantityInput,
  unitForPickedIngredient,
  videoDraftProblems,
  videoDraftToForm,
  videoFormToDraft,
  type VideoDraftFormValues,
} from '@chefer/utils';
import type { RouterOutputs } from '../../lib/trpc';
import { pickedFromRef, type CatalogRef, type PickedIngredient } from '../ingredients/catalog-line';
import { IngredientPickerField } from '../ingredients/ingredient-picker-field';
import { useComputedNutrition } from '../ingredients/use-computed-nutrition';

// Video import review form — port of web's VideoDraftForm. The AI reads the
// video's words into a draft; the user corrects it, fills what the video did
// not say ("Not found — please add"), then saves through importSave. The
// shared videoDraftProblems validates, so web, mobile and the API agree.
//
// plan-ingredient-catalog §6.2/§10: each ingredient row's name is the catalog
// picker. Lines the resolver matched start linked; the rest show its
// candidates ("Pick a match") and the search / "Create … as my ingredient".
// Linked rows offer only the units the row can weigh. Nutrition is computed
// live with the shared engine; saving sends every `ingredientId` and
// `acceptPartial` (false when complete, true after an explicit confirm).

export type VideoImportPreview = RouterOutputs['recipe']['importVideoPreview'];
export type VideoDraftRecipe = VideoImportPreview['draft'];
/** The reviewed draft as importSave takes it: lines may carry their catalog id. */
export type VideoSaveRecipe = Omit<VideoDraftRecipe, 'ingredients'> & {
  ingredients: (VideoDraftRecipe['ingredients'][number] & { ingredientId?: string })[];
};

type IngredientRow = VideoDraftFormValues['ingredients'][number];

/** Per-row catalog link, parallel to `form.ingredients`. */
interface RowLink {
  ingredient: PickedIngredient | null;
  candidates: readonly CatalogRef[];
}

const UNIT_GROUP_LABELS = INGREDIENT_CATALOG_COPY.unit.groups;
function unitOptions(ingredient: PickedIngredient): SelectOption[] {
  return ingredientUnitGroups(ingredient).flatMap((g) =>
    g.units.map((u) => ({ value: u, label: u, group: UNIT_GROUP_LABELS[g.label] })),
  );
}

/** The resolver's answer for each draft line → the row's starting link. */
function initialLinks(preview: VideoImportPreview): RowLink[] {
  const rows = Math.max(preview.draft.ingredients.length, 1);
  return Array.from({ length: rows }, (_, i) => {
    const r = preview.resolution.at(i);
    return {
      ingredient: r?.match ? pickedFromRef(r.match) : null,
      candidates: r?.match ? [] : (r?.candidates ?? []),
    };
  });
}

function Label({ children }: { children: string }) {
  return <Text className="mb-1 text-xs font-medium text-gray-600">{children}</Text>;
}

export function VideoDraftForm({
  preview,
  saving,
  saveError,
  nameError = null,
  onBack,
  onSave,
}: {
  preview: VideoImportPreview;
  saving: boolean;
  saveError: string | null;
  /** A server rejection of the name (Following word filter, `data.textRejected`), shown under the field. */
  nameError?: string | null;
  onBack: () => void;
  onSave: (recipe: VideoSaveRecipe, acceptPartial: boolean) => void;
}) {
  const [form, setForm] = useState<VideoDraftFormValues>(() => videoDraftToForm(preview.draft));
  const [touched, setTouched] = useState<Partial<Record<VideoDraftField, boolean>>>({});
  const [problems, setProblems] = useState<string[]>([]);
  const [unheard, setUnheard] = useState<boolean[]>(() =>
    preview.draft.ingredients.map((_, i) => preview.unverifiedQuantities.includes(i)),
  );
  const [links, setLinks] = useState<RowLink[]>(() => initialLinks(preview));
  const [pendingSave, setPendingSave] = useState<VideoSaveRecipe | null>(null);

  // Live nutrition over the linked rows (the server recomputes on save).
  const live = useComputedNutrition(
    form.ingredients.flatMap((row, i) => {
      const quantity = parseQuantityInput(row.quantity) ?? 0;
      if (!row.name.trim() || quantity <= 0) return [];
      return [{ ingredientId: links[i]?.ingredient?.id ?? null, quantity, unit: row.unit }];
    }),
    Number(form.servings) || 1,
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
    setLinks((l) => l.filter((_, i) => i !== index));
  };
  const pickIngredient = (index: number, ingredient: PickedIngredient) => {
    const row = form.ingredients[index];
    setIngredient(index, {
      name: ingredient.name.slice(0, 80),
      unit: unitForPickedIngredient(row?.unit ?? '', ingredient, { keepDefault: true }),
    });
    setLinks((l) => l.map((link, i) => (i === index ? { ingredient, candidates: [] } : link)));
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
    if (found.length > 0) return;
    const finalized = finalizeVideoDraft(preview.draft, edited);
    // finalize drops blank rows in order: re-attach each kept row's link.
    const keptIds = form.ingredients.flatMap((row, i) =>
      row.name.trim() ? [links[i]?.ingredient?.id] : [],
    );
    const recipe: VideoSaveRecipe = {
      ...finalized,
      ingredients: finalized.ingredients.map((ing, k) => {
        const id = keptIds[k];
        return id ? { ...ing, ingredientId: id } : ing;
      }),
    };
    if (live.result?.status === 'PARTIAL') {
      setPendingSave(recipe);
      return;
    }
    onSave(recipe, false);
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
          className={cn((nameMissing || nameError) && 'border-red-400')}
        />
        {nameError ? (
          <Text
            testID="video-draft-name-error"
            nativeID="video-draft-name-error"
            className="mt-1 text-sm text-red-700"
          >
            {nameError}
          </Text>
        ) : null}
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
                {links[index]?.ingredient ? (
                  <View className="w-20">
                    <SelectField
                      testID={`video-draft-unit-${index}`}
                      label={`Unit for ingredient ${index + 1}`}
                      value={row.unit || null}
                      options={unitOptions(links[index].ingredient)}
                      onChange={(unit) => setIngredient(index, { unit })}
                      placeholder="unit"
                    />
                  </View>
                ) : (
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
                )}
                <IngredientPickerField
                  testID={`video-draft-ingredient-${index}`}
                  name={row.name}
                  linked={Boolean(links[index]?.ingredient)}
                  needsMatch={!links[index]?.ingredient && row.name.trim() !== ''}
                  suggestions={links[index]?.candidates}
                  placeholder="Search ingredient"
                  accessibilityLabel={`Ingredient ${index + 1}`}
                  onPick={(ingredient) => pickIngredient(index, ingredient)}
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
              {!links[index]?.ingredient && row.name.trim() !== '' ? (
                <View testID={`video-draft-match-${index}`} className="mt-1 gap-1">
                  <Text className="text-xs text-amber-800">
                    {(links[index]?.candidates.length ?? 0) > 0
                      ? INGREDIENT_CATALOG_COPY.picker.pickMatchHint(row.name)
                      : INGREDIENT_CATALOG_COPY.picker.noMatchFound(row.name)}
                  </Text>
                  <View className="flex-row flex-wrap gap-1.5">
                    {(links[index]?.candidates ?? []).slice(0, 3).map((c) => (
                      // MO-01 press feedback on each suggestion.
                      <PressableScale
                        key={c.id}
                        pressScale="control"
                        testID={`video-draft-candidate-${index}-${c.slug}`}
                        accessibilityRole="button"
                        accessibilityLabel={`${INGREDIENT_CATALOG_COPY.picker.pickMatch}: ${c.name}`}
                        onPress={() => {
                          haptics.selection();
                          pickIngredient(index, pickedFromRef(c));
                        }}
                        className="min-h-11 justify-center rounded-full border border-amber-300 bg-amber-50 px-3"
                      >
                        <Text numberOfLines={1} className="text-xs font-medium text-amber-900">
                          {c.name}
                        </Text>
                      </PressableScale>
                    ))}
                  </View>
                </View>
              ) : null}
            </View>
          ))}
        </View>
        <Button
          testID="video-draft-add-ingredient"
          variant="ghost"
          size="sm"
          className="mt-1 self-start"
          onPress={() => {
            update({ ingredients: [...form.ingredients, { quantity: '', unit: '', name: '' }] });
            setLinks((l) => [...l, { ingredient: null, candidates: [] }]);
          }}
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

      {live.result ? (
        <Text
          testID="video-draft-nutrition-status"
          className={cn(
            'text-xs',
            live.result.status === 'PARTIAL' ? 'text-amber-800' : 'text-gray-600',
          )}
        >
          {live.result.status === 'PARTIAL'
            ? INGREDIENT_CATALOG_COPY.status.incomplete(incompleteLineCount(live.result))
            : `${INGREDIENT_CATALOG_COPY.status.computedFrom(live.result.lines.length)} · ${live.result.perServing.calories} kcal per serving`}
        </Text>
      ) : null}
      <Text variant="muted" className="text-xs">
        {INGREDIENT_CATALOG_COPY.importReview.nutritionNote} Saved to your private collection only.
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

      <ConfirmSheet
        testID="video-draft-save-partial"
        visible={pendingSave !== null}
        onClose={() => setPendingSave(null)}
        title={INGREDIENT_CATALOG_COPY.importReview.saveIncompleteTitle}
        body={INGREDIENT_CATALOG_COPY.importReview.saveIncompleteBody(
          Math.max(1, live.result ? incompleteLineCount(live.result) : 1),
        )}
        confirmLabel={INGREDIENT_CATALOG_COPY.importReview.saveIncompleteConfirm}
        cancelLabel={INGREDIENT_CATALOG_COPY.importReview.saveIncompleteCancel}
        onConfirm={() => {
          const recipe = pendingSave;
          setPendingSave(null);
          if (recipe) onSave(recipe, true);
        }}
      />
    </View>
  );
}
