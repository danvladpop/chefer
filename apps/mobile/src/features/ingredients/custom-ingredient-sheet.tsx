import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  INGREDIENT_CATALOG_COPY,
  INGREDIENT_CATEGORIES,
  INGREDIENT_CATEGORY_LABELS,
  type IngredientCategory,
} from '@chefer/types';
import {
  Button,
  Card,
  Input,
  keyboardDismissMode,
  SelectField,
  Sheet,
  Text,
  type SelectOption,
} from '@chefer/ui-mobile';
import { userFacingErrorMessage } from '@chefer/utils';
import { useIsPremium } from '../../hooks/use-is-premium';
import { trpc } from '../../lib/trpc';
import { AiConsentHost, useAiConsent } from '../ai-consent/ai-consent-provider';
import { friendsErrorData } from '../friends/api/friends-errors';
import { useNumericChain, type NumericChainFieldProps } from '../preferences/use-numeric-chain';
import { PremiumHost } from '../premium/premium-host';
import { pickedFromRef, pickedFromSearchRow, type PickedIngredient } from './catalog-line';
import { ingredientsCopy } from './copy';
import { openIngredientAutofillUpsell } from './premium-upsell';
import { useKeyboardAwareMaxHeight } from './use-keyboard-aware-max-height';

const copy = INGREDIENT_CATALOG_COPY.custom;

/** Reserve for the grabber + title row and the pinned Save footer — see
 * ingredient-search-sheet.tsx / use-keyboard-aware-max-height.ts. */
const CONTENT_RESERVED_PX = 200;

const CATEGORY_OPTIONS: SelectOption[] = INGREDIENT_CATEGORIES.map((c) => ({
  value: c,
  label: INGREDIENT_CATEGORY_LABELS[c],
}));

export interface CustomIngredientSheetProps {
  visible: boolean;
  onClose: () => void;
  onExited?: () => void;
  /** Prefills the name from the search query that had no match. */
  initialName: string;
  /** The new private row — or the catalog row the user chose instead ("Use it"). */
  onCreated: (ingredient: PickedIngredient) => void;
  testID?: string;
}

type MacroKey = 'calories' | 'protein' | 'carbs' | 'fat' | 'fiber';
type Macros = Record<MacroKey, string>;
const EMPTY_MACROS: Macros = { calories: '', protein: '', carbs: '', fat: '', fiber: '' };

const numStr = (v: number | null | undefined) => (v == null ? '' : String(v));

/** "1,5" or "1.5" → 1.5; blank or junk → NaN. */
function parseDecimal(value: string): number {
  const t = value.trim().replace(',', '.');
  return t === '' ? Number.NaN : Number(t);
}

/** Pulls the catalog row's name out of the API's CONFLICT message ("Chefer already has "X" — …"). */
export function conflictNameOf(message: string): string | null {
  const m = /already has "([^"]+)"/.exec(message);
  return m?.[1] ?? null;
}

/** The five core values are all filled in and within the API's bounds (D5). */
export function macrosComplete(m: Macros): boolean {
  const kcal = parseDecimal(m.calories);
  const grams = [m.protein, m.carbs, m.fat, m.fiber].map(parseDecimal);
  return (
    Number.isFinite(kcal) &&
    kcal >= 0 &&
    kcal <= 900 &&
    grams.every((g) => Number.isFinite(g) && g >= 0 && g <= 100)
  );
}

/**
 * The private-ingredient sheet (plan-ingredient-catalog §8.1, D5; T-40.8
 * originally) — the mobile twin of web's `IngredientFormModal`, over
 * `ingredients.createCustom`.
 * - All five core values per 100 g are required (kcal, protein, carbs, fat,
 *   fiber), copied from the package label; carbs follow the EU convention.
 * - Optional: category, one piece's weight (a `piece` portion) and what 100 ml
 *   weighs (the density that lets it be measured by volume).
 * - CONFLICT ("Chefer already has X"): the sheet offers the catalog row
 *   ("Use it", looked up through `ingredients.resolve`) or an explicit
 *   "No, mine is different", which re-sends with `confirmDifferent`.
 * - "Fill in for me" (`ingredients.estimateNutrition`, name only) stays
 *   premium-only and labelled as a suggestion; free taps open the upsell. It
 *   asks for AI-data consent first (the typed name is what is sent).
 *
 * Content sits in a keyboard-aware bounded ScrollView (see
 * use-keyboard-aware-max-height.ts) so the pinned Save footer is never
 * overlapped.
 */
export function CustomIngredientSheet({
  visible,
  onClose,
  onExited,
  initialName,
  onCreated,
  testID = 'custom-ingredient-sheet',
}: CustomIngredientSheetProps) {
  const isPremium = useIsPremium();
  // R-10: "Fill in for me" sends the typed name to the AI provider, so it asks
  // for AI-data consent like every other AI action (it used to be exempt).
  const requestAiConsent = useAiConsent();
  const utils = trpc.useUtils();
  const contentMaxHeight = useKeyboardAwareMaxHeight(CONTENT_RESERVED_PX);

  const [name, setName] = useState(initialName);
  // name → kcal → protein → carbs → fat → fibre → g/piece → g/100ml: Next / Done.
  const numbers = useNumericChain('custom-ingredient', 7);
  const [category, setCategory] = useState<IngredientCategory | null>(null);
  const [macros, setMacros] = useState<Macros>(EMPTY_MACROS);
  const [gramsPerPiece, setGramsPerPiece] = useState('');
  const [gramsPer100ml, setGramsPer100ml] = useState('');
  const [attempted, setAttempted] = useState(false);
  const [conflictName, setConflictName] = useState<string | null>(null);
  const [useItError, setUseItError] = useState(false);

  useEffect(() => {
    if (visible) {
      setName(initialName);
      setCategory(null);
      setMacros(EMPTY_MACROS);
      setGramsPerPiece('');
      setGramsPer100ml('');
      setAttempted(false);
      setConflictName(null);
      setUseItError(false);
    }
  }, [visible, initialName]);

  const createMutation = trpc.ingredients.createCustom.useMutation({
    meta: { silent: true },
    onSuccess: (row) => {
      const picked = pickedFromSearchRow(row);
      if (picked) onCreated(picked);
    },
    onError: (error) => {
      if (friendsErrorData(error).code === 'CONFLICT') {
        setConflictName(conflictNameOf(error.message) ?? name.trim());
      }
    },
  });
  const estimateMutation = trpc.ingredients.estimateNutrition.useMutation({
    meta: { silent: true },
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
    },
  });

  const nameOk = name.trim().length >= 2;
  const complete = nameOk && macrosComplete(macros);
  const pieceGrams = parseDecimal(gramsPerPiece);
  const per100ml = parseDecimal(gramsPer100ml);

  const submit = (confirmDifferent = false) => {
    setAttempted(true);
    if (!complete || createMutation.isPending) return;
    setConflictName(null);
    createMutation.mutate({
      name: name.trim(),
      caloriesPer100g: parseDecimal(macros.calories),
      proteinPer100g: parseDecimal(macros.protein),
      carbsPer100g: parseDecimal(macros.carbs),
      fatPer100g: parseDecimal(macros.fat),
      fiberPer100g: parseDecimal(macros.fiber),
      gramsPerPiece: Number.isFinite(pieceGrams) && pieceGrams > 0 ? pieceGrams : null,
      densityGPerMl: Number.isFinite(per100ml) && per100ml > 0 ? Math.min(3, per100ml / 100) : null,
      ...(category ? { category } : {}),
      ...(confirmDifferent ? { confirmDifferent: true } : {}),
    });
  };

  const chooseCatalogRow = async () => {
    setUseItError(false);
    try {
      const [hit] = await utils.ingredients.resolve.fetch({
        lines: [{ rawName: conflictName ?? name.trim() }],
      });
      const match = hit?.match;
      if (match) {
        onCreated(pickedFromRef(match));
        return;
      }
    } catch {
      // fall through to the inline error
    }
    setUseItError(true);
  };

  const fillInForMe = () => {
    if (isPremium === false) {
      openIngredientAutofillUpsell();
      return;
    }
    if (!nameOk || estimateMutation.isPending) return;
    requestAiConsent('ingredient-estimate', () => estimateMutation.mutate({ name: name.trim() }));
  };

  const locked = isPremium === false;
  const showConflict = conflictName !== null;
  const genericError =
    createMutation.isError && friendsErrorData(createMutation.error).code !== 'CONFLICT';

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      onExited={onExited}
      title={copy.title}
      testID={testID}
      scrollable={false}
      footer={
        showConflict ? undefined : (
          <Button
            testID={`${testID}-save`}
            loading={createMutation.isPending}
            disabled={createMutation.isPending}
            onPress={() => submit(false)}
          >
            {createMutation.isPending ? copy.saving : copy.save}
          </Button>
        )
      }
    >
      <ScrollView
        testID={`${testID}-scroll`}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={keyboardDismissMode()}
        className="grow-0"
        style={{ maxHeight: contentMaxHeight }}
      >
        <View className="gap-4">
          {showConflict ? (
            <Card testID={`${testID}-conflict`} className="gap-3 border-amber-200 bg-amber-50">
              <View className="gap-1">
                <Text className="text-sm font-semibold text-amber-900">
                  {copy.conflictTitle(conflictName)}
                </Text>
                <Text className="text-xs text-amber-900">{copy.conflictBody}</Text>
              </View>
              <Button testID={`${testID}-use-it`} onPress={() => void chooseCatalogRow()}>
                {copy.useIt}
              </Button>
              <Button
                testID={`${testID}-mine-is-different`}
                variant="outline"
                loading={createMutation.isPending}
                onPress={() => submit(true)}
              >
                {copy.mineIsDifferent}
              </Button>
              {useItError ? (
                <Text className="text-xs text-destructive">
                  {INGREDIENT_CATALOG_COPY.picker.noMatches}
                </Text>
              ) : null}
            </Card>
          ) : null}

          <Text variant="muted" className="text-xs">
            {copy.description}
          </Text>

          <View className="gap-1">
            <Text variant="label">{copy.name}</Text>
            <Input
              testID={`${testID}-name`}
              accessibilityLabel={copy.name}
              value={name}
              onChangeText={(v) => {
                setName(v);
                setConflictName(null);
              }}
              returnKeyType="next"
              onSubmitEditing={numbers.focusFirst}
            />
          </View>

          <SelectField
            testID={`${testID}-category`}
            label={copy.category}
            value={category}
            options={CATEGORY_OPTIONS}
            onChange={(v) => setCategory(v as IngredientCategory)}
            placeholder={copy.categoryPlaceholder}
          />

          <View className="gap-2">
            <View className="flex-row items-center justify-between gap-2">
              <Text variant="label" className="min-w-0 flex-1">
                {copy.nutritionHeading}
              </Text>
              <Button
                testID={`${testID}-fill-in`}
                variant="outline"
                size="sm"
                disabled={!nameOk || estimateMutation.isPending}
                onPress={fillInForMe}
              >
                <View className="flex-row items-center gap-1.5">
                  <Ionicons
                    name={locked ? 'lock-closed-outline' : 'sparkles-outline'}
                    size={14}
                    color="#944a00"
                  />
                  <Text className="text-xs font-medium text-primary">
                    {estimateMutation.isPending
                      ? ingredientsCopy.custom.fillInEstimating
                      : ingredientsCopy.custom.fillInForMe}
                  </Text>
                  {locked && (
                    <Text className="text-xs font-medium text-primary">
                      {ingredientsCopy.custom.fillInLocked}
                    </Text>
                  )}
                </View>
              </Button>
            </View>

            {estimateMutation.isError && (
              <Text testID={`${testID}-fill-in-error`} className="text-xs text-destructive">
                {ingredientsCopy.custom.fillInError}
              </Text>
            )}
            {estimateMutation.data && (
              <Text className="text-xs text-muted-foreground">
                {estimateMutation.data.source === 'catalog'
                  ? ingredientsCopy.custom.fillInFromCatalog
                  : ingredientsCopy.custom.fillInFromAi}
              </Text>
            )}

            <View className="flex-row gap-2">
              <MacroField
                testID={`${testID}-kcal`}
                chain={numbers.bind(0)}
                label={copy.kcal}
                value={macros.calories}
                invalid={attempted}
                onChangeText={(v) => setMacros((m) => ({ ...m, calories: v }))}
              />
              <MacroField
                testID={`${testID}-protein`}
                chain={numbers.bind(1)}
                label={copy.protein}
                value={macros.protein}
                invalid={attempted}
                onChangeText={(v) => setMacros((m) => ({ ...m, protein: v }))}
              />
              <MacroField
                testID={`${testID}-carbs`}
                chain={numbers.bind(2)}
                label={copy.carbs}
                value={macros.carbs}
                invalid={attempted}
                onChangeText={(v) => setMacros((m) => ({ ...m, carbs: v }))}
              />
            </View>
            <View className="flex-row gap-2">
              <MacroField
                testID={`${testID}-fat`}
                chain={numbers.bind(3)}
                label={copy.fat}
                value={macros.fat}
                invalid={attempted}
                onChangeText={(v) => setMacros((m) => ({ ...m, fat: v }))}
              />
              <MacroField
                testID={`${testID}-fiber`}
                chain={numbers.bind(4)}
                label={copy.fiber}
                value={macros.fiber}
                invalid={attempted}
                onChangeText={(v) => setMacros((m) => ({ ...m, fiber: v }))}
              />
              <View className="min-w-0 flex-1" />
            </View>
            <Text variant="muted" className="text-xs">
              {copy.carbsHint}
            </Text>
            {attempted && !complete ? (
              <Text
                testID={`${testID}-incomplete`}
                accessibilityLiveRegion="polite"
                className="text-xs text-destructive"
              >
                {copy.allRequired}
              </Text>
            ) : null}
          </View>

          <OptionalNumber
            testID={`${testID}-grams-per-piece`}
            chain={numbers.bind(5)}
            label={copy.gramsPerPiece}
            hint={copy.gramsPerPieceHint}
            value={gramsPerPiece}
            onChangeText={setGramsPerPiece}
            placeholder="e.g. 45"
          />
          <OptionalNumber
            testID={`${testID}-grams-per-100ml`}
            chain={numbers.bind(6)}
            label={copy.gramsPer100ml}
            hint={copy.gramsPer100mlHint}
            value={gramsPer100ml}
            onChangeText={setGramsPer100ml}
            placeholder="e.g. 103"
          />

          {genericError && (
            <Card testID={`${testID}-save-error`} className="border-red-200 bg-red-50">
              <Text className="text-sm text-red-600">
                {userFacingErrorMessage(createMutation.error)}
              </Text>
            </Card>
          )}
        </View>
      </ScrollView>
      {/* "Fill in for me" can open the premium sheet from in here. iOS cannot
          present a Modal over a Modal, so the sheet nests in its own host
          (the AiConsentHost pattern). */}
      {numbers.bars}
      <PremiumHost />
      {/* ...and so does the AI consent sheet. */}
      <AiConsentHost />
    </Sheet>
  );
}

function MacroField({
  testID,
  label,
  value,
  invalid,
  onChangeText,
  chain,
}: {
  testID: string;
  label: string;
  value: string;
  invalid: boolean;
  onChangeText: (v: string) => void;
  chain: NumericChainFieldProps;
}) {
  const bad = invalid && !Number.isFinite(parseDecimal(value));
  return (
    <View className="min-w-0 flex-1 gap-1">
      <Text variant="label" className="text-xs">
        {label} *
      </Text>
      <Input
        testID={testID}
        accessibilityLabel={`${label}, required`}
        value={value}
        onChangeText={onChangeText}
        keyboardType="decimal-pad"
        placeholder="0"
        className={bad ? 'border-red-400 px-2 text-center' : 'px-2 text-center'}
        {...chain}
      />
    </View>
  );
}

function OptionalNumber({
  testID,
  label,
  hint,
  value,
  onChangeText,
  placeholder,
  chain,
}: {
  testID: string;
  label: string;
  hint: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  chain: NumericChainFieldProps;
}) {
  return (
    <View className="gap-1">
      <Text variant="label">
        {label}{' '}
        <Text variant="muted" className="text-xs">
          ({hint})
        </Text>
      </Text>
      <Input
        testID={testID}
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        keyboardType="decimal-pad"
        placeholder={placeholder}
        {...chain}
      />
    </View>
  );
}
