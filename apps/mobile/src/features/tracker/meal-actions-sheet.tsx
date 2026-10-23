import { useEffect, useMemo, useState } from 'react';
import { Keyboard, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SAVED_MEAL_LIMITS, SAVED_MEALS_COPY, savedMealNameSchema } from '@chefer/types';
import {
  Button,
  Chip,
  DONE_FIELD_PROPS,
  Input,
  SegmentedControl,
  Sheet,
  Text,
  useSnackbar,
  useThemeColors,
} from '@chefer/ui-mobile';
import {
  copyMealMessage,
  copyMealTargetDays,
  defaultMealSlot,
  QUICK_ADD_MEAL_TYPES,
  savedMealSummary,
  userFacingErrorMessage,
  type QuickAddMealType,
} from '@chefer/utils';
import { track } from '../../lib/analytics';
import { trpc } from '../../lib/trpc';
import { invalidateDayQueries } from './invalidate';
import { REBALANCE_PREVIEW, recordRebalanceOutcome } from './rebalance-offer-store';
import { mealLabel } from './slot-copy';

// Lane A2 (both shells): one sheet for "save this meal" and "copy this meal".
// Pick a meal of the day being viewed, then save it under a name (re-logged
// later in one tap from the Log sheet's "Saved meals"), or copy it to another
// day and/or meal with an Undo. The saved meals themselves are listed at the
// bottom, each with a delete.

const MEAL_OPTIONS = QUICK_ADD_MEAL_TYPES.map((value) => ({
  value,
  label: mealLabel(value),
  testID: `meal-actions-meal-${value}`,
}));

export interface MealActionsSheetProps {
  visible: boolean;
  onClose: () => void;
  /** The device-local day being viewed (YYYY-MM-DD). */
  date: string;
  /** The day's entries' meal types, for the "n entries" line. */
  loggedMealTypes: readonly string[];
}

export function MealActionsSheet({
  visible,
  onClose,
  date,
  loggedMealTypes,
}: MealActionsSheetProps) {
  const snackbar = useSnackbar();
  const colors = useThemeColors();
  const utils = trpc.useUtils();
  const [mealType, setMealType] = useState<QuickAddMealType>(() =>
    defaultMealSlot(new Date().getHours()),
  );
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const days = useMemo(() => copyMealTargetDays(new Date()), []);
  const [toDate, setToDate] = useState(days[0]?.date ?? date);
  const [toMealType, setToMealType] = useState<QuickAddMealType>(mealType);

  useEffect(() => {
    if (!visible) return;
    setName('');
    setNameError(null);
    // Open on the first meal that has entries, so both actions work at once.
    const first = QUICK_ADD_MEAL_TYPES.find((t) => loggedMealTypes.includes(t));
    const start = first ?? defaultMealSlot(new Date().getHours());
    setMealType(start);
    setToMealType(start);
    setToDate(days.find((d) => d.date !== date)?.date ?? days[0]?.date ?? date);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-seed on open only
  }, [visible]);

  const count = loggedMealTypes.filter((t) => t === mealType).length;
  const sameTarget = toDate === date && toMealType === mealType;

  const savedQuery = trpc.savedMeals.list.useQuery(undefined, { enabled: visible });
  const createMutation = trpc.savedMeals.createFromDay.useMutation({ meta: { silent: true } });
  const deleteMutation = trpc.savedMeals.delete.useMutation({ meta: { silent: true } });
  const copyMutation = trpc.tracker.copyMeal.useMutation({ meta: { silent: true } });
  const undoMutation = trpc.tracker.deleteEntries.useMutation({
    meta: { silent: true },
    onSuccess: () => invalidateDayQueries(utils),
  });

  const save = () => {
    const parsed = savedMealNameSchema.safeParse(name);
    if (!parsed.success) {
      setNameError(parsed.error.issues[0]?.message ?? 'Give the meal a name.');
      return;
    }
    Keyboard.dismiss();
    createMutation.mutate(
      { name: parsed.data, date, mealType },
      {
        onSuccess: (saved) => {
          track('saved_meal_created', { itemCount: saved.items.length });
          void utils.savedMeals.list.invalidate();
          setName('');
          snackbar.show({ message: `Saved “${saved.name}”`, tone: 'success' });
        },
      },
    );
  };

  const copy = () => {
    copyMutation.mutate(
      { fromDate: date, fromMealType: mealType, toDate, toMealType, ...REBALANCE_PREVIEW },
      {
        onSuccess: (result) => {
          recordRebalanceOutcome(result);
          invalidateDayQueries(utils);
          const ids = result.copiedEntryIds;
          track('meal_copied', { itemCount: ids.length, sameDay: toDate === date });
          const dayLabel = days.find((d) => d.date === toDate)?.label ?? toDate;
          onClose();
          snackbar.show({
            message: copyMealMessage(ids.length, mealLabel(toMealType), dayLabel),
            ...(ids.length > 0 && {
              actionLabel: 'Undo',
              onAction: () => undoMutation.mutate({ date: toDate, entryIds: ids }),
            }),
          });
        },
      },
    );
  };

  const saved = savedQuery.data ?? [];

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={SAVED_MEALS_COPY.actionsTitle}
      testID="meal-actions"
    >
      <View className="gap-4">
        <View className="gap-1">
          <Text className="text-xs font-medium text-label-secondary">Meal</Text>
          <SegmentedControl
            size="sm"
            options={MEAL_OPTIONS}
            value={mealType}
            onChange={(next) => {
              setMealType(next);
              setToMealType(next);
            }}
            accessibilityLabel="Meal to save or copy"
          />
          <Text testID="meal-actions-count" className="text-xs text-label-secondary">
            {count === 0
              ? SAVED_MEALS_COPY.nothingLogged
              : `${count} ${count === 1 ? 'entry' : 'entries'} logged`}
          </Text>
        </View>

        <View className="gap-2 rounded-xl border border-border bg-card p-3">
          <Text className="text-sm font-semibold text-label">{SAVED_MEALS_COPY.saveAs}</Text>
          <Input
            testID="meal-actions-name"
            accessibilityLabel="Name for this meal"
            value={name}
            maxLength={SAVED_MEAL_LIMITS.nameMaxLength}
            placeholder="e.g. Weekday breakfast"
            onChangeText={(text) => {
              setName(text);
              setNameError(null);
              createMutation.reset();
            }}
            {...DONE_FIELD_PROPS}
            onSubmitEditing={save}
          />
          {(nameError ?? createMutation.error) && (
            <Text testID="meal-actions-save-error" className="text-sm text-danger">
              {nameError ?? userFacingErrorMessage(createMutation.error)}
            </Text>
          )}
          <Button
            testID="meal-actions-save"
            size="sm"
            disabled={count === 0}
            loading={createMutation.isPending}
            onPress={save}
          >
            Save meal
          </Button>
        </View>

        <View className="gap-2 rounded-xl border border-border bg-card p-3">
          <Text className="text-sm font-semibold text-label">{SAVED_MEALS_COPY.copyTo}</Text>
          <View className="flex-row flex-wrap gap-1.5">
            {days.map((d) => (
              <Chip
                key={d.date}
                testID={`meal-actions-day-${d.date}`}
                label={d.label}
                selected={toDate === d.date}
                onPress={() => setToDate(d.date)}
              />
            ))}
          </View>
          <SegmentedControl
            size="sm"
            options={QUICK_ADD_MEAL_TYPES.map((value) => ({
              value,
              label: mealLabel(value),
              testID: `meal-actions-to-meal-${value}`,
            }))}
            value={toMealType}
            onChange={setToMealType}
            accessibilityLabel="Meal to copy to"
          />
          {sameTarget && count > 0 && (
            <Text className="text-xs text-label-secondary">{SAVED_MEALS_COPY.sameTarget}</Text>
          )}
          {copyMutation.isError && (
            <Text testID="meal-actions-copy-error" className="text-sm text-danger">
              {userFacingErrorMessage(copyMutation.error)}
            </Text>
          )}
          <Button
            testID="meal-actions-copy"
            size="sm"
            variant="outline"
            disabled={count === 0 || sameTarget}
            loading={copyMutation.isPending}
            onPress={copy}
          >
            Copy meal
          </Button>
        </View>

        {saved.length > 0 && (
          <View className="gap-1.5">
            <Text
              accessibilityRole="header"
              className="text-xs font-semibold uppercase tracking-widest text-label-secondary"
            >
              Your saved meals
            </Text>
            {saved.map((meal) => (
              <View
                key={meal.id}
                className="flex-row items-center gap-3 rounded-xl border border-border bg-card p-2.5"
              >
                <View className="min-w-0 flex-1">
                  <Text numberOfLines={1} className="text-sm font-medium text-label">
                    {meal.name}
                  </Text>
                  <Text className="text-xs text-label-secondary">
                    {savedMealSummary(meal.items, false)}
                  </Text>
                </View>
                <Pressable
                  testID={`meal-actions-delete-${meal.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Delete saved meal ${meal.name}`}
                  disabled={deleteMutation.isPending}
                  onPress={() =>
                    deleteMutation.mutate(
                      { id: meal.id },
                      { onSuccess: () => void utils.savedMeals.list.invalidate() },
                    )
                  }
                  className="h-11 w-11 items-center justify-center"
                >
                  <Ionicons name="trash-outline" size={18} color={colors.labelTertiary} />
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </View>
    </Sheet>
  );
}
