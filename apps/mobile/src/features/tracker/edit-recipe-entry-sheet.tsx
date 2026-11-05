import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Button, SegmentedControl, Sheet, Text } from '@chefer/ui-mobile';
import {
  formatPortion,
  proteinLabel,
  QUICK_ADD_MEAL_TYPES,
  type QuickAddMealType,
} from '@chefer/utils';
import { useT } from '../../lib/i18n';
import { useNumbersMode } from '../numbers-mode/numbers-mode';

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

export interface EditRecipeEntrySheetProps {
  visible: boolean;
  onClose: () => void;
  entry: {
    entryId?: string | undefined;
    recipeName: string;
    mealType: string;
    kcal: number;
    protein?: number | undefined;
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
  const { t } = useT();
  const { proteinOnly, noNumbers } = useNumbersMode(); // WP-08, lane E3
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
      title={t('tracker.editEntry.title')}
      testID="edit-recipe-entry-sheet"
      footer={
        <View className="gap-2">
          <Button
            testID="edit-recipe-entry-save"
            onPress={() => onSave({ portionMultiplier: Number(portion), mealType })}
          >
            {t('common.actions.save')}
          </Button>
          <Button testID="edit-recipe-entry-delete" variant="destructive" onPress={onDelete}>
            {t('common.actions.delete')}
          </Button>
        </View>
      }
    >
      <View className="gap-1">
        <Text numberOfLines={2} className="text-sm font-medium text-label">
          {entry.recipeName}
        </Text>
        <Text className="text-xs text-label-tertiary">
          {noNumbers
            ? t('tracker.editEntry.logged')
            : proteinOnly
              ? entry.protein === undefined
                ? t('tracker.editEntry.logged')
                : t('tracker.editEntry.loggedAsProtein', { protein: proteinLabel(entry.protein) })
              : t('tracker.editEntry.loggedAsKcal', { kcal: Math.round(entry.kcal) })}
        </Text>
      </View>

      <View className="gap-1">
        <Text className="text-xs font-medium text-label-secondary">
          {t('tracker.editEntry.portion')}
        </Text>
        <SegmentedControl
          size="sm"
          options={portionOptions}
          value={portion}
          onChange={setPortion}
          accessibilityLabel={t('tracker.editEntry.portion')}
          testID="edit-recipe-entry-portion"
        />
      </View>

      <View className="gap-1">
        <Text className="text-xs font-medium text-label-secondary">
          {t('tracker.editEntry.meal')}
        </Text>
        <SegmentedControl
          size="sm"
          options={QUICK_ADD_MEAL_TYPES.map((value) => ({
            value,
            label: t(`tracker.meals.${value}`),
            testID: `edit-recipe-entry-meal-${value}`,
          }))}
          value={mealType}
          onChange={setMealType}
          accessibilityLabel={t('tracker.editEntry.meal')}
          testID="edit-recipe-entry-meal"
        />
      </View>
    </Sheet>
  );
}
