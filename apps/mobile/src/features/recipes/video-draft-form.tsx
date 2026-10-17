import { useRef, useState } from 'react';
import { AccessibilityInfo, View, type TextInput } from 'react-native';
import {
  INGREDIENT_CATALOG_COPY,
  VIDEO_IMPORT_COPY,
  type LineProblem,
  type VideoDraftField,
} from '@chefer/types';
import {
  ConfirmSheet,
  DONE_FIELD_PROPS,
  haptics,
  IconButton,
  Input,
  PressableScale,
  SelectField,
  Text,
  useScrollFieldIntoView,
  useThemeColors,
  type SelectOption,
} from '@chefer/ui-mobile';
import {
  cn,
  finalizeVideoDraft,
  incompleteLineCount,
  ingredientUnitGroups,
  lineProblemCopy,
  unitForPickedIngredient,
  videoDraftProblems,
  videoDraftToForm,
  videoFormToDraft,
  type VideoDraftFormValues,
} from '@chefer/utils';
import { Icon } from '../../components/icon';
import type { RouterOutputs } from '../../lib/trpc';
import { pickedFromRef, type CatalogRef, type PickedIngredient } from '../ingredients/catalog-line';
import { IngredientPickerField } from '../ingredients/ingredient-picker-field';
import { useComputedNutrition } from '../ingredients/use-computed-nutrition';
import { TrainButton } from '../shell/train/train-button';
import { draftNutritionLines, rowLineProblems } from './draft-line-problems';

// Import review form — port of web's VideoDraftForm. The AI reads the video's
// words (or, UX-REC-15, a link's page or pasted text) into a draft; the user
// corrects it, fills what the source did not say ("Not found — please add"),
// then saves through importSave. The shared videoDraftProblems validates, so
// web, mobile and the API agree. Link and text imports pass the chosen variant
// as the draft with no `notFound` / `transcriptSource`: same form, same checks.
//
// plan-ingredient-catalog §6.2/§10: each ingredient row's name is the catalog
// picker. Lines the resolver matched start linked; the rest show its
// candidates ("Pick a match") and the search / "Create … as my ingredient".
// Linked rows offer only the units the row can weigh. Nutrition is computed
// live with the shared engine; saving sends every `ingredientId` and
// `acceptPartial` (false when complete, true after an explicit confirm).

export type VideoImportPreview = RouterOutputs['recipe']['importVideoPreview'];
export type VideoDraftRecipe = VideoImportPreview['draft'];
/**
 * What the form needs to start: the draft, the resolver's answer per line and
 * the safety verdict. The video-only parts are optional, so a link/text import
 * (no transcript, nothing "not found") feeds the same form.
 */
export type DraftReviewSource = Pick<VideoImportPreview, 'draft' | 'resolution' | 'safety'> &
  Partial<
    Pick<
      VideoImportPreview,
      'notFound' | 'unverifiedQuantities' | 'assumptions' | 'transcriptSource'
    >
  >;
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
function initialLinks(preview: DraftReviewSource): RowLink[] {
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
  return <Text className="mb-1 text-subhead font-medium text-label-secondary">{children}</Text>;
}

/** A field the draft is missing ("Not found — please add"). */
function MissingPill({ children, className }: { children: string; className?: string }) {
  return (
    <Text
      className={cn(
        'self-start rounded-full bg-surface-sunken px-2 text-caption font-semibold text-danger',
        className,
      )}
    >
      {children}
    </Text>
  );
}

/** A value the video did not state ("Servings: not stated…"). */
function NotStatedPill({ children }: { children: string }) {
  return (
    <Text className="rounded-full bg-brand-tint px-2 text-caption font-semibold text-brand">
      {children}
    </Text>
  );
}

/** A form section heading (SectionTitle's style). */
const SECTION_TITLE = 'text-title3 font-bold text-label';
/** A text field in the redesign's roles (over the kit Input's look). */
const FIELD = 'rounded-control border-separator bg-surface text-body text-label';
/** The redesign's card (BoardCard's look). */
const CARD = 'gap-1 rounded-card border border-separator bg-surface p-4';
/** F2: the field a row's problem is about — amount, or the unit it can't weigh. */
const UNIT_PROBLEMS: readonly LineProblem[] = ['NO_DENSITY', 'NO_PORTION', 'BAD_UNIT'];

export function VideoDraftForm({
  preview,
  saving,
  saveError,
  nameError = null,
  onBack,
  onSave,
  saveLabel = 'Save recipe',
}: {
  preview: DraftReviewSource;
  /** The primary button's label. */
  saveLabel?: string;
  saving: boolean;
  saveError: string | null;
  /** A server rejection of the name (Following word filter, `data.textRejected`), shown under the field. */
  nameError?: string | null;
  onBack: () => void;
  onSave: (recipe: VideoSaveRecipe, acceptPartial: boolean) => void;
}) {
  const colors = useThemeColors();
  const [form, setForm] = useState<VideoDraftFormValues>(() => videoDraftToForm(preview.draft));
  const [touched, setTouched] = useState<Partial<Record<VideoDraftField, boolean>>>({});
  const [problems, setProblems] = useState<string[]>([]);
  const notFound = preview.notFound ?? [];
  const assumptions = preview.assumptions ?? [];
  const [unheard, setUnheard] = useState<boolean[]>(() =>
    preview.draft.ingredients.map((_, i) => (preview.unverifiedQuantities ?? []).includes(i)),
  );
  const [links, setLinks] = useState<RowLink[]>(() => initialLinks(preview));
  const [pendingSave, setPendingSave] = useState<VideoSaveRecipe | null>(null);

  // Live nutrition over the linked rows (the server recomputes on save).
  const liveLines = draftNutritionLines(form.ingredients, (i) => links[i]?.ingredient?.id ?? null);
  const live = useComputedNutrition(liveLines.lines, Number(form.servings) || 1);
  // F2: each counted line's problem, on the form row it came from.
  const rowProblems = rowLineProblems(form.ingredients.length, liveLines.rowOf, live.result);
  const incompleteCopy = live.result
    ? INGREDIENT_CATALOG_COPY.status.incomplete(incompleteLineCount(live.result))
    : '';
  const scrollIntoView = useScrollFieldIntoView();
  const rowRefs = useRef<(View | null)[]>([]);
  const qtyRefs = useRef<(TextInput | null)[]>([]);
  const noteRefs = useRef<(View | null)[]>([]);
  // F2: "Incomplete …" takes the user to the first row it counted — the amount
  // field when that is what's missing, else screen-reader focus on its hint.
  const revealFirstProblem = () => {
    const index = rowProblems.findIndex((p) => p !== undefined);
    if (index < 0) return;
    scrollIntoView(rowRefs.current[index] ?? null);
    const qty = qtyRefs.current[index];
    if (rowProblems[index] === 'BAD_QTY' && qty) {
      qty.focus();
      return;
    }
    const note = noteRefs.current[index];
    if (note) AccessibilityInfo.sendAccessibilityEvent(note, 'focus');
  };

  const flagged = (field: VideoDraftField) => notFound.includes(field);
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
      <View className="rounded-card bg-brand-tint p-4">
        <View className="flex-row items-start gap-2">
          <Icon name="info" size={20} color={colors.brand} />
          <View className="min-w-0 flex-1 gap-0.5">
            <Text className="text-headline font-semibold text-brand">
              {VIDEO_IMPORT_COPY.checkTitle}
            </Text>
            <Text className="text-subhead text-label">
              {preview.transcriptSource
                ? VIDEO_IMPORT_COPY.checkBody[preview.transcriptSource]
                : 'We read this from your link or text. Check the amounts and steps, and fix anything that looks off before you save.'}
            </Text>
          </View>
        </View>
      </View>

      {!preview.safety.ok && (
        <View testID="video-draft-unsafe" className={cn(CARD, 'border-danger')}>
          <Text className="text-subhead text-danger">
            This recipe conflicts with your household&apos;s allergies or diet (
            {preview.safety.issues.join(', ')}). Edit those ingredients before cooking it.
          </Text>
        </View>
      )}

      <View>
        <Label>Recipe name</Label>
        {nameMissing && <MissingPill className="mb-1">{VIDEO_IMPORT_COPY.notFound}</MissingPill>}
        <Input
          testID="video-draft-name"
          accessibilityLabel="Recipe name"
          value={form.name}
          maxLength={120}
          onChangeText={(name) => update({ name })}
          className={cn(FIELD, (nameMissing || nameError) && 'border-danger')}
          {...DONE_FIELD_PROPS}
        />
        {nameError ? (
          <Text
            testID="video-draft-name-error"
            nativeID="video-draft-name-error"
            className="mt-1 text-subhead text-danger"
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
              className={FIELD}
              keyboardType="number-pad"
              onChangeText={(text) => update({ [key]: text }, field)}
              {...DONE_FIELD_PROPS}
            />
          </View>
        ))}
      </View>
      {(servingsUnstated || timeUnstated) && (
        <View className="-mt-2 flex-row flex-wrap gap-2">
          {servingsUnstated && (
            <NotStatedPill>{`Servings: ${VIDEO_IMPORT_COPY.notStated.toLowerCase()}`}</NotStatedPill>
          )}
          {timeUnstated && (
            <NotStatedPill>{`Time: ${VIDEO_IMPORT_COPY.notStated.toLowerCase()}`}</NotStatedPill>
          )}
        </View>
      )}

      <View>
        <View className="mb-2 flex-row flex-wrap items-center gap-2">
          <Text accessibilityRole="header" className={SECTION_TITLE}>
            Ingredients
          </Text>
          {ingredientsMissing && <MissingPill>{VIDEO_IMPORT_COPY.notFound}</MissingPill>}
        </View>
        <View className="gap-2">
          {form.ingredients.map((row, index) => {
            const problem = rowProblems[index];
            // An unlinked row says "Pick a match" below; a linked row's
            // NO_INGREDIENT is its catalog data still loading (web does the same).
            const hint =
              links[index]?.ingredient && problem && problem !== 'NO_INGREDIENT'
                ? lineProblemCopy(problem)
                : null;
            const qtyBad = hint !== null && problem === 'BAD_QTY';
            const unitBad =
              hint !== null && problem !== undefined && UNIT_PROBLEMS.includes(problem);
            return (
              <View
                key={index}
                ref={(node) => {
                  rowRefs.current[index] = node;
                }}
              >
                <View className="flex-row items-center gap-2">
                  <Input
                    ref={(node) => {
                      qtyRefs.current[index] = node;
                    }}
                    testID={`video-draft-qty-${index}`}
                    accessibilityLabel={`Amount for ingredient ${index + 1}`}
                    accessibilityHint={qtyBad ? hint : undefined}
                    value={row.quantity}
                    placeholder="Qty"
                    keyboardType="decimal-pad"
                    onChangeText={(quantity) => setIngredient(index, { quantity })}
                    className={cn(
                      FIELD,
                      'w-16',
                      (unheard[index] === true || qtyBad) && 'border-attention',
                    )}
                    {...DONE_FIELD_PROPS}
                  />
                  {links[index]?.ingredient ? (
                    // FB7-03: wide enough for "piece" / "tbsp" / "clove" on one
                    // line (w-20 broke them mid-word). F2: a unit the row can't
                    // weigh gets a ring drawn outside it (-m-0.5 + 4pt wider), so
                    // the field itself keeps its width.
                    <View
                      testID={`video-draft-unit-ring-${index}`}
                      className={cn(
                        'w-24',
                        unitBad && '-m-0.5 w-[100px] rounded-control border-2 border-attention',
                      )}
                    >
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
                      className={cn(FIELD, 'w-16')}
                      {...DONE_FIELD_PROPS}
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
                  <IconButton
                    accessibilityLabel={`Remove ingredient ${index + 1}`}
                    icon={<Icon name="close" size={20} color={colors.labelTertiary} />}
                    onPress={() => removeIngredient(index)}
                  />
                </View>
                {unheard[index] && (
                  <Text className="mt-1 text-caption text-attention">
                    {VIDEO_IMPORT_COPY.quantityCheck}
                  </Text>
                )}
                {hint ? (
                  <View
                    ref={(node) => {
                      noteRefs.current[index] = node;
                    }}
                    testID={`video-draft-problem-${index}`}
                    accessible
                    accessibilityLabel={`Ingredient ${index + 1}, ${row.name.trim()}: ${hint}`}
                    className="mt-1"
                  >
                    <Text className="text-caption text-attention">{hint}</Text>
                  </View>
                ) : null}
                {!links[index]?.ingredient && row.name.trim() !== '' ? (
                  <View
                    ref={(node) => {
                      noteRefs.current[index] = node;
                    }}
                    testID={`video-draft-match-${index}`}
                    className="mt-1 gap-1"
                  >
                    <Text className="text-caption text-attention">
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
                          className="min-h-11 justify-center rounded-full bg-brand-tint px-3"
                        >
                          <Text numberOfLines={1} className="text-caption font-semibold text-brand">
                            {c.name}
                          </Text>
                        </PressableScale>
                      ))}
                    </View>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
        <TrainButton
          testID="video-draft-add-ingredient"
          variant="ghost"
          icon="add"
          label="Add ingredient"
          className="mt-1 self-start px-0"
          onPress={() => {
            update({ ingredients: [...form.ingredients, { quantity: '', unit: '', name: '' }] });
            setLinks((l) => [...l, { ingredient: null, candidates: [] }]);
          }}
        />
      </View>

      <View>
        <View className="mb-2 flex-row flex-wrap items-center gap-2">
          <Text accessibilityRole="header" className={SECTION_TITLE}>
            Steps
          </Text>
          {stepsMissing && <MissingPill>{VIDEO_IMPORT_COPY.notFound}</MissingPill>}
        </View>
        <View className="gap-2">
          {form.instructions.map((step, index) => (
            <View key={index} className="flex-row items-start gap-2">
              <Text className="mt-3 w-6 text-right text-subhead font-semibold text-label-secondary">
                {index + 1}.
              </Text>
              <Input
                testID={`video-draft-step-${index}`}
                accessibilityLabel={`Step ${index + 1}`}
                value={step}
                multiline
                maxLength={500}
                onChangeText={(text) =>
                  update({
                    instructions: form.instructions.map((s, i) => (i === index ? text : s)),
                  })
                }
                className={cn(FIELD, 'min-h-16 min-w-0 flex-1', stepsMissing && 'border-danger')}
              />
              <IconButton
                accessibilityLabel={`Remove step ${index + 1}`}
                icon={<Icon name="close" size={20} color={colors.labelTertiary} />}
                onPress={() =>
                  update({ instructions: form.instructions.filter((_, i) => i !== index) })
                }
              />
            </View>
          ))}
        </View>
        <TrainButton
          testID="video-draft-add-step"
          variant="ghost"
          icon="add"
          label="Add step"
          className="mt-1 self-start px-0"
          onPress={() => update({ instructions: [...form.instructions, ''] })}
        />
      </View>

      {assumptions.length > 0 && (
        <View className="gap-0.5 rounded-card bg-surface-sunken p-4">
          <Text className="text-subhead font-semibold text-label">What we guessed</Text>
          {assumptions.map((a) => (
            <Text key={a} className="text-subhead text-label-secondary">
              • {a}
            </Text>
          ))}
        </View>
      )}

      {live.result?.status === 'PARTIAL' ? (
        // F2: the count is a way in — tap it to reach the first row it counted.
        <PressableScale
          testID="video-draft-nutrition-status-button"
          pressScale="control"
          accessibilityRole="button"
          accessibilityLabel={incompleteCopy}
          accessibilityHint="Shows the first ingredient that needs data"
          onPress={revealFirstProblem}
          className="min-h-11 flex-row items-center gap-1 self-start"
        >
          <Text testID="video-draft-nutrition-status" className="text-caption text-attention">
            {incompleteCopy}
          </Text>
          <Icon name="chevronRight" size={14} color={colors.attention} />
        </PressableScale>
      ) : live.result ? (
        <Text testID="video-draft-nutrition-status" className="text-caption text-label-secondary">
          {`${INGREDIENT_CATALOG_COPY.status.computedFrom(live.result.lines.length)} · ${live.result.perServing.calories} kcal per serving`}
        </Text>
      ) : null}
      <Text className="text-caption text-label-secondary">
        {INGREDIENT_CATALOG_COPY.importReview.nutritionNote} Saved to your private collection only.
      </Text>

      {(problems.length > 0 || saveError) && (
        <View testID="video-draft-problems" className={cn(CARD, 'border-danger')}>
          {problems.map((p) => (
            <Text key={p} className="text-callout text-danger">
              {p}
            </Text>
          ))}
          {saveError && <Text className="text-callout text-danger">{saveError}</Text>}
        </View>
      )}

      <TrainButton
        testID="video-draft-save"
        size="lg"
        label={saveLabel}
        loading={saving}
        onPress={handleSave}
      />
      <TrainButton variant="ghost" label="Start over" onPress={onBack} />

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
