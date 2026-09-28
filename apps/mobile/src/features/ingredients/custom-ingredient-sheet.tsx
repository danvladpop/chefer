import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, Input, Sheet, Text } from '@chefer/ui-mobile';
import { useIsPremium } from '../../hooks/use-is-premium';
import { trpc } from '../../lib/trpc';
import { ingredientsCopy } from './copy';
import { openIngredientAutofillUpsell } from './premium-upsell';
import { useKeyboardAwareMaxHeight } from './use-keyboard-aware-max-height';

/** Reserve for the grabber + title row and the pinned Save footer — see
 * ingredient-search-sheet.tsx / use-keyboard-aware-max-height.ts. */
const CONTENT_RESERVED_PX = 200;

export interface CustomIngredientSheetProps {
  visible: boolean;
  onClose: () => void;
  onExited?: () => void;
  /** Prefills the name from the search query that had no match. */
  initialName: string;
  onCreated: (displayName: string) => void;
  testID?: string;
}

const numStr = (v: number | null | undefined) => (v == null ? '' : String(v));

/**
 * T-40.8 (UX-40 slice 2): the mobile twin of web's `IngredientFormModal` in
 * create mode, over `ingredients.createCustom`. `Fill in for me`
 * (`ingredients.estimateNutrition`) sends only the ingredient NAME — per the
 * delta rules' existing precedent, a name-only nutrition estimate is not AI-
 * consent-gated. It is premium-only (T-40.11's pitch, source
 * `ingredient-autofill`) and the only lock on this screen; free taps open
 * the upsell instead of calling the mutation at all. No fiber field (D-18),
 * no price/checkout copy anywhere in the locked path (delta rule 2).
 *
 * Orchestrator review fix (Maestro, iOS simulator): the same class of bug
 * as ingredient-search-sheet.tsx's follow-up — a kit Sheet's `maxHeight`
 * never accounts for the on-screen keyboard, so content could in principle
 * render past the visible area and under the pinned Save footer. This
 * content is short and static (no dynamic list), but it's wrapped in a
 * keyboard-aware-bounded ScrollView defensively, for the same reason.
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
  const contentMaxHeight = useKeyboardAwareMaxHeight(CONTENT_RESERVED_PX);

  const [name, setName] = useState(initialName);
  const [macros, setMacros] = useState({ calories: '', protein: '', carbs: '', fat: '' });
  const [gramsPerPiece, setGramsPerPiece] = useState('');

  useEffect(() => {
    if (visible) {
      setName(initialName);
      setMacros({ calories: '', protein: '', carbs: '', fat: '' });
      setGramsPerPiece('');
    }
  }, [visible, initialName]);

  const createMutation = trpc.ingredients.createCustom.useMutation({
    onSuccess: (row) => onCreated(row.displayName),
  });
  const estimateMutation = trpc.ingredients.estimateNutrition.useMutation({
    onSuccess: (est) => {
      if (!est) return;
      setMacros({
        calories: numStr(est.caloriesPer100g),
        protein: numStr(est.proteinPer100g),
        carbs: numStr(est.carbsPer100g),
        fat: numStr(est.fatPer100g),
      });
      if (est.gramsPerPiece != null) setGramsPerPiece(String(est.gramsPerPiece));
    },
  });

  const canSubmit =
    name.trim().length >= 2 && macros.calories !== '' && Number(macros.calories) >= 0;

  const submit = () => {
    if (!canSubmit) return;
    createMutation.mutate({
      name: name.trim(),
      caloriesPer100g: Number(macros.calories),
      proteinPer100g: Number(macros.protein) || 0,
      carbsPer100g: Number(macros.carbs) || 0,
      fatPer100g: Number(macros.fat) || 0,
      fiberPer100g: 0,
      gramsPerPiece: gramsPerPiece ? Number(gramsPerPiece) : null,
    });
  };

  const fillInForMe = () => {
    if (isPremium === false) {
      openIngredientAutofillUpsell();
      return;
    }
    if (name.trim().length < 2 || estimateMutation.isPending) return;
    estimateMutation.mutate({ name: name.trim() });
  };

  const locked = isPremium === false;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      onExited={onExited}
      title={ingredientsCopy.custom.title}
      testID={testID}
      // Orchestrator review fix: match recipe-picker-sheet.tsx's proven
      // pattern — this content is short and fully static (no dynamic
      // list), so it never needs to scroll; avoiding the kit Sheet's own
      // ScrollView sidesteps the same collapse seen on ingredient-search-sheet.
      scrollable={false}
      footer={
        <Button
          testID={`${testID}-save`}
          loading={createMutation.isPending}
          disabled={!canSubmit || createMutation.isPending}
          onPress={submit}
        >
          {createMutation.isPending ? ingredientsCopy.custom.saving : ingredientsCopy.custom.save}
        </Button>
      }
    >
      <ScrollView
        testID={`${testID}-scroll`}
        keyboardShouldPersistTaps="handled"
        className="grow-0"
        style={{ maxHeight: contentMaxHeight }}
      >
        <View className="gap-4">
          <Text variant="muted" className="text-xs">
            {ingredientsCopy.custom.description}
          </Text>

          <View className="gap-1">
            <Text variant="label">{ingredientsCopy.custom.name}</Text>
            <Input
              testID={`${testID}-name`}
              accessibilityLabel={ingredientsCopy.custom.name}
              value={name}
              onChangeText={setName}
            />
          </View>

          <View className="gap-2">
            <View className="flex-row items-center justify-between">
              <Text variant="label">{ingredientsCopy.custom.nutritionHeading}</Text>
              <Button
                testID={`${testID}-fill-in`}
                variant="outline"
                size="sm"
                disabled={name.trim().length < 2 || estimateMutation.isPending}
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
            {/* react-query's discriminated union already guarantees isPending
              is false whenever data is set — no separate check needed. */}
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
                label="kcal"
                value={macros.calories}
                onChangeText={(v) => setMacros((m) => ({ ...m, calories: v }))}
              />
              <MacroField
                testID={`${testID}-protein`}
                label="Protein g"
                value={macros.protein}
                onChangeText={(v) => setMacros((m) => ({ ...m, protein: v }))}
              />
              <MacroField
                testID={`${testID}-carbs`}
                label="Carbs g"
                value={macros.carbs}
                onChangeText={(v) => setMacros((m) => ({ ...m, carbs: v }))}
              />
              <MacroField
                testID={`${testID}-fat`}
                label="Fat g"
                value={macros.fat}
                onChangeText={(v) => setMacros((m) => ({ ...m, fat: v }))}
              />
            </View>
          </View>

          <View className="gap-1">
            <Text variant="label">
              {ingredientsCopy.custom.gramsPerPiece}{' '}
              <Text variant="muted" className="text-xs">
                ({ingredientsCopy.custom.gramsPerPieceHint})
              </Text>
            </Text>
            <Input
              testID={`${testID}-grams-per-piece`}
              accessibilityLabel={ingredientsCopy.custom.gramsPerPiece}
              value={gramsPerPiece}
              onChangeText={setGramsPerPiece}
              keyboardType="decimal-pad"
              placeholder="e.g. 118 for a banana"
            />
          </View>

          {createMutation.isError && (
            <Card testID={`${testID}-save-error`} className="border-red-200 bg-red-50">
              <Text className="text-sm text-red-600">{createMutation.error.message}</Text>
            </Card>
          )}
        </View>
      </ScrollView>
    </Sheet>
  );
}

function MacroField({
  testID,
  label,
  value,
  onChangeText,
}: {
  testID: string;
  label: string;
  value: string;
  onChangeText: (v: string) => void;
}) {
  return (
    <View className="min-w-0 flex-1 gap-1">
      <Text variant="label" className="text-xs">
        {label}
      </Text>
      <Input
        testID={testID}
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        keyboardType="decimal-pad"
        placeholder="0"
        className="px-2 text-center"
      />
    </View>
  );
}
