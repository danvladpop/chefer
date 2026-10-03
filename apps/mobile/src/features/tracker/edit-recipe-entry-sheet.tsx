import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Button, SegmentedControl, Sheet, Text } from '@chefer/ui-mobile';
import { formatPortion, QUICK_ADD_MEAL_TYPES, type QuickAddMealType } from '@chefer/utils';

// Edit or remove a logged recipe that is no longer on the day's plan — the
// "Also eaten" rows (UX-FOOD-03). A mis-log or a stale one used to be
// read-only, its calories stuck on the day for good. Portion and meal are
// editable; the server recomputes the macros from the recipe. Delete lives in
// the footer and the tracker offers Undo.

const PORTIONS = [0.5, 1, 1.5, 2] as const;
const PORTION_OPTIONS = PORTIONS.map((p) => ({
  value: String(p),
  label: formatPortion(p),
  testID: `edit-recipe-entry-portion-${p}`,
}));
const MEAL_OPTIONS = QUICK_ADD_MEAL_TYPES.map((value) => ({
  value,
  label: value.charAt(0).toUpperCase() + value.slice(1),
  testID: `edit-recipe-entry-meal-${value}`,
}));

export interface EditRecipeEntrySheetProps {
  visible: boolean;
  onClose: () => void;
  entry: {
    entryId?: string | undefined;
    recipeName: string;
    mealType: string;
    kcal: number;
    portionMultiplier?: number | undefined;
  } | null;
  onSave: (edit: { portionMultiplier: number; mealType: string }) => void;
  onDelete: () => void;
}

export function EditRecipeEntrySheet({
  visible,
  onClose,
  entry,
  onSave,
  onDelete,
}: EditRecipeEntrySheetProps) {
  const [portion, setPortion] = useState('1');
  const [mealType, setMealType] = useState<QuickAddMealType>('dinner');

  useEffect(() => {
    if (!entry) return;
    const p = entry.portionMultiplier ?? 1;
    // A portion the picker doesn't list (the plan's 1¼×) is kept as typed.
    setPortion(String(p));
    setMealType(
      (QUICK_ADD_MEAL_TYPES as readonly string[]).includes(entry.mealType)
        ? (entry.mealType as QuickAddMealType)
        : 'dinner',
    );
  }, [entry]);

  if (!entry) return null;

  const portionOptions = PORTION_OPTIONS.some((o) => o.value === portion)
    ? PORTION_OPTIONS
    : [
        ...PORTION_OPTIONS,
        {
          value: portion,
          label: formatPortion(Number(portion)),
          testID: 'edit-recipe-entry-portion-custom',
        },
      ].sort((a, b) => Number(a.value) - Number(b.value));

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Edit meal"
      testID="edit-recipe-entry-sheet"
      footer={
        <View className="gap-2">
          <Button
            testID="edit-recipe-entry-save"
            onPress={() => onSave({ portionMultiplier: Number(portion), mealType })}
          >
            Save
          </Button>
          <Button testID="edit-recipe-entry-delete" variant="destructive" onPress={onDelete}>
            Delete
          </Button>
        </View>
      }
    >
      <View className="gap-1">
        <Text numberOfLines={2} className="text-sm font-medium text-gray-800">
          {entry.recipeName}
        </Text>
        <Text className="text-xs text-gray-500">Logged as {Math.round(entry.kcal)} kcal</Text>
      </View>

      <View className="gap-1">
        <Text className="text-xs font-medium text-gray-600">Portion</Text>
        <SegmentedControl
          size="sm"
          options={portionOptions}
          value={portion}
          onChange={setPortion}
          accessibilityLabel="Portion"
          testID="edit-recipe-entry-portion"
        />
      </View>

      <View className="gap-1">
        <Text className="text-xs font-medium text-gray-600">Meal</Text>
        <SegmentedControl
          size="sm"
          options={MEAL_OPTIONS}
          value={mealType}
          onChange={setMealType}
          accessibilityLabel="Meal"
          testID="edit-recipe-entry-meal"
        />
      </View>
    </Sheet>
  );
}
