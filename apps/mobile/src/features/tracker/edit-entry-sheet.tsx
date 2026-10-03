import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Button, Input, SegmentedControl, Sheet, Text, useSnackbar } from '@chefer/ui-mobile';
import {
  checkMacroSanity,
  formatQuickAddGrams,
  QUICK_ADD_MEAL_TYPES,
  userFacingErrorMessage,
  type CustomEntryRow,
  type QuickAddMealType,
} from '@chefer/utils';
import { trpc } from '../../lib/trpc';
import { invalidateDayQueries } from './invalidate';

// Edit any custom entry, undo any delete (bug B-34, T-19.2). Only custom
// entries (quick-adds, photo scans) reach this sheet — a planned-recipe row
// is "edited" by re-ticking it with a different portion (the API's
// updateCustomMeal answers NOT_FOUND for a recipe entryId, by design).

const MEAL_OPTIONS = QUICK_ADD_MEAL_TYPES.map((value) => ({
  value,
  label: value.charAt(0).toUpperCase() + value.slice(1),
  testID: `edit-entry-meal-${value}`,
}));

const MACROS = [
  { key: 'protein', label: 'Protein' },
  { key: 'carbs', label: 'Carbs' },
  { key: 'fat', label: 'Fat' },
] as const;

type MacroKey = (typeof MACROS)[number]['key'];

/** What `tracker.restoreCustomMeal` takes — the exact snapshot Undo sends back. */
interface CustomEntrySnapshot {
  entryId: string;
  custom: { name: string; estimatedBy: 'vision' | 'manual' };
  mealType: string;
  portionMultiplier: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface EditEntrySheetProps {
  visible: boolean;
  onClose: () => void;
  /** Device-local YYYY-MM-DD day the entry belongs to. */
  date: string;
  entry: CustomEntryRow | null;
  onSaved: () => void;
  onDeleted: () => void;
}

export function EditEntrySheet({
  visible,
  onClose,
  date,
  entry,
  onSaved,
  onDeleted,
}: EditEntrySheetProps) {
  const snackbar = useSnackbar();
  const utils = trpc.useUtils();

  const [name, setName] = useState('');
  const [mealType, setMealType] = useState<QuickAddMealType>('snack');
  const [kcal, setKcal] = useState('');
  const [macros, setMacros] = useState<Record<MacroKey, string>>({
    protein: '',
    carbs: '',
    fat: '',
  });
  const [sanityOverridden, setSanityOverridden] = useState(false);

  useEffect(() => {
    if (!entry) return;
    setName(entry.name);
    setMealType(
      (QUICK_ADD_MEAL_TYPES as readonly string[]).includes(entry.mealType)
        ? (entry.mealType as QuickAddMealType)
        : 'snack',
    );
    setKcal(String(entry.kcal));
    setMacros({
      protein: formatQuickAddGrams(entry.protein),
      carbs: formatQuickAddGrams(entry.carbs),
      fat: formatQuickAddGrams(entry.fat),
    });
    setSanityOverridden(false);
  }, [entry]);

  const updateMutation = trpc.tracker.updateCustomMeal.useMutation({
    meta: { silent: true },
    onSuccess: () => {
      invalidateDayQueries(utils, date);
      snackbar.show({ message: 'Changes saved', tone: 'success' });
      onSaved();
      onClose();
    },
  });
  const deleteMutation = trpc.tracker.deleteCustomMeal.useMutation({ meta: { silent: true } });
  // UX-FOOD-06: a failed restore (the Undo) says so, and either way the day
  // is re-read so the screen shows what the server holds.
  const restoreMutation = trpc.tracker.restoreCustomMeal.useMutation({
    meta: { silent: true },
    onError: (error) =>
      snackbar.show({ message: `Couldn't bring that back. ${userFacingErrorMessage(error)}` }),
    onSettled: () => invalidateDayQueries(utils, date),
  });

  if (!entry) return null;
  const entryId = entry.entryId;

  const kcalNumber = Math.max(0, Math.round(Number(kcal.replace(',', '.')) || 0));
  const macroNumbers = {
    protein: Math.max(0, Number(macros.protein.replace(',', '.')) || 0),
    carbs: Math.max(0, Number(macros.carbs.replace(',', '.')) || 0),
    fat: Math.max(0, Number(macros.fat.replace(',', '.')) || 0),
  };
  const sanity = sanityOverridden ? null : checkMacroSanity({ kcal: kcalNumber, ...macroNumbers });
  const canSave =
    !!entryId && name.trim().length > 0 && kcalNumber > 0 && !updateMutation.isPending;

  const save = () => {
    if (!canSave || !entryId) return;
    if (sanity?.message) return; // Fix / Log anyway gates the submit
    updateMutation.mutate({
      date,
      entryId,
      name: name.trim(),
      estimatedBy: entry.estimatedBy,
      mealType,
      kcal: kcalNumber,
      protein: macroNumbers.protein,
      carbs: macroNumbers.carbs,
      fat: macroNumbers.fat,
    });
  };

  const del = () => {
    if (deleteMutation.isPending || !entryId) return;
    // Snapshot exactly what's on screen (the entry as stored, not the edited
    // draft) so Undo restores it as it was before this delete — any in-flight
    // edits in this sheet are discarded along with the delete.
    const snapshot: CustomEntrySnapshot = {
      entryId,
      custom: { name: entry.name, estimatedBy: entry.estimatedBy },
      mealType: entry.mealType,
      portionMultiplier: 1,
      kcal: entry.kcal,
      protein: entry.protein,
      carbs: entry.carbs,
      fat: entry.fat,
    };
    onClose();
    deleteMutation.mutate(
      // UX-FOOD-17: by stable id (the index is only the fallback).
      { date, entryId, entryIndex: entry.entryIndex },
      {
        onSuccess: () => {
          invalidateDayQueries(utils, date);
          onDeleted();
          snackbar.show({
            message: `Deleted ${entry.name}`,
            actionLabel: 'Undo',
            onAction: () => restoreMutation.mutate({ date, entry: snapshot }),
          });
        },
        // The sheet closes before the server answers; if the delete failed
        // the row is still there (nothing was removed), so say why.
        onError: (error) =>
          snackbar.show({
            message: `Couldn't delete ${entry.name}. ${userFacingErrorMessage(error)}`,
          }),
      },
    );
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Edit entry"
      testID="edit-entry-sheet"
      footer={
        <View className="gap-2">
          {sanity?.message && (
            <View testID="edit-entry-sanity" className="gap-2 rounded-lg bg-amber-50 p-3">
              <Text className="text-xs text-amber-800">{sanity.message}</Text>
              <Button
                testID="edit-entry-sanity-log-anyway"
                variant="outline"
                size="sm"
                onPress={() => setSanityOverridden(true)}
              >
                Log anyway
              </Button>
            </View>
          )}
          <Button
            testID="edit-entry-save"
            loading={updateMutation.isPending}
            disabled={!canSave || !!sanity?.message}
            onPress={save}
          >
            Save
          </Button>
          <Button testID="edit-entry-delete" variant="destructive" onPress={del}>
            Delete
          </Button>
        </View>
      }
    >
      <View className="gap-1">
        <Text className="text-xs font-medium text-gray-600">What did you eat?</Text>
        <Input
          testID="edit-entry-name"
          accessibilityLabel="Name"
          value={name}
          onChangeText={setName}
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
          testID="edit-entry-meal"
        />
      </View>

      <View className="gap-1">
        <Text className="text-xs font-medium text-gray-600">Calories</Text>
        <View className="flex-row items-center gap-2">
          <Input
            testID="edit-entry-kcal"
            accessibilityLabel="Calories"
            value={kcal}
            keyboardType="number-pad"
            onChangeText={(text) => {
              setKcal(text);
              setSanityOverridden(false);
            }}
            className="min-w-0 flex-1"
          />
          <Text className="text-sm text-gray-400">kcal</Text>
        </View>
      </View>

      <View className="gap-1">
        <Text className="text-xs font-medium text-gray-600">Macros (grams)</Text>
        <View className="flex-row gap-2">
          {MACROS.map(({ key, label }) => (
            <View key={key} className="min-w-0 flex-1 gap-1">
              <Input
                testID={`edit-entry-${key}`}
                accessibilityLabel={`${label} grams`}
                value={macros[key]}
                keyboardType="decimal-pad"
                onChangeText={(text) => {
                  setMacros((prev) => ({ ...prev, [key]: text }));
                  setSanityOverridden(false);
                }}
              />
            </View>
          ))}
        </View>
      </View>

      {updateMutation.isError && (
        <Text testID="edit-entry-api-error" className="text-sm text-red-600">
          {userFacingErrorMessage(updateMutation.error)}
        </Text>
      )}
    </Sheet>
  );
}
