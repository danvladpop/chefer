import { useEffect, useMemo, useState } from 'react';
import { Keyboard, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Translator } from '@chefer/i18n';
import { SAVED_MEAL_LIMITS, savedMealNameSchema } from '@chefer/types';
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
  copyMealTargetDays,
  defaultMealSlot,
  formatNumber,
  QUICK_ADD_MEAL_TYPES,
  savedMealTotals,
  userFacingErrorMessage,
  type QuickAddMealType,
} from '@chefer/utils';
import { track } from '../../lib/analytics';
import { useT } from '../../lib/i18n';
import { trpc } from '../../lib/trpc';
import { invalidateDayQueries } from './invalidate';
import { REBALANCE_PREVIEW, recordRebalanceOutcome } from './rebalance-offer-store';

// Lane A2 (both shells): one sheet for "save this meal" and "copy this meal".
// Pick a meal of the day being viewed, then save it under a name (re-logged
// later in one tap from the Log sheet's "Saved meals"), or copy it to another
// day and/or meal with an Undo. The saved meals themselves are listed at the
// bottom, each with a delete.

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

/**
 * The copy-to day chips ("Today", "Yesterday", "Mon 3") and the same day as it
 * sits inside the snackbar sentence. `copyMealTargetDays` gives the dates,
 * newest first.
 */
function copyDayLabels(t: Translator['t'], days: { date: string }[]) {
  return days.map(({ date }, index) => {
    const [y = 0, m = 1, d = 1] = date.split('-').map(Number);
    const weekday = t(
      `common.weekdaysShort.${WEEKDAY_KEYS[new Date(y, m - 1, d).getDay()] ?? 'mon'}`,
    );
    const label =
      index === 0
        ? t('tracker.savedMeals.today')
        : index === 1
          ? t('tracker.savedMeals.yesterday')
          : t('tracker.savedMeals.dayLabel', { weekday, day: String(d) });
    const inSentence =
      index === 0
        ? t('tracker.savedMeals.todayInSentence')
        : index === 1
          ? t('tracker.savedMeals.yesterdayInSentence')
          : label;
    return { date, label, inSentence };
  });
}

/** "Copied 3 entries to lunch, yesterday" — the snackbar after a copy. */
function copiedMessage(t: Translator['t'], count: number, meal: QuickAddMealType, day: string) {
  if (count === 0) return t('tracker.savedMeals.nothingToCopy');
  return t('tracker.savedMeals.copied', {
    count,
    meal: t(`tracker.mealInSentence.${meal}`),
    day,
  });
}

/** "3 items · 540 kcal". */
function savedMealSummaryText(t: Translator['t'], items: Parameters<typeof savedMealTotals>[0]) {
  return t('tracker.savedMeals.summaryKcal', {
    count: items.length,
    kcal: formatNumber(savedMealTotals(items).kcal),
  });
}

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
  const { t } = useT();
  const snackbar = useSnackbar();
  const colors = useThemeColors();
  const utils = trpc.useUtils();
  const [mealType, setMealType] = useState<QuickAddMealType>(() =>
    defaultMealSlot(new Date().getHours()),
  );
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const days = useMemo(() => copyDayLabels(t, copyMealTargetDays(new Date())), [t]);
  const [toDate, setToDate] = useState(days[0]?.date ?? date);
  const [toMealType, setToMealType] = useState<QuickAddMealType>(mealType);

  useEffect(() => {
    if (!visible) return;
    setName('');
    setNameError(null);
    // Open on the first meal that has entries, so both actions work at once.
    const first = QUICK_ADD_MEAL_TYPES.find((m) => loggedMealTypes.includes(m));
    const start = first ?? defaultMealSlot(new Date().getHours());
    setMealType(start);
    setToMealType(start);
    setToDate(days.find((d) => d.date !== date)?.date ?? days[0]?.date ?? date);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-seed on open only
  }, [visible]);

  const count = loggedMealTypes.filter((m) => m === mealType).length;
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
      // The input's maxLength caps the length, so the one failure left is an empty name.
      setNameError(t('tracker.savedMeals.nameRequired'));
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
          snackbar.show({
            message: t('tracker.savedMeals.saved', { name: saved.name }),
            tone: 'success',
          });
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
          const dayLabel = days.find((d) => d.date === toDate)?.inSentence ?? toDate;
          onClose();
          snackbar.show({
            message: copiedMessage(t, ids.length, toMealType, dayLabel),
            ...(ids.length > 0 && {
              actionLabel: t('tracker.undo'),
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
      title={t('tracker.savedMeals.actionsTitle')}
      testID="meal-actions"
    >
      <View className="gap-4">
        <View className="gap-1">
          <Text className="text-xs font-medium text-label-secondary">
            {t('tracker.savedMeals.meal')}
          </Text>
          <SegmentedControl
            size="sm"
            options={QUICK_ADD_MEAL_TYPES.map((value) => ({
              value,
              label: t(`tracker.meals.${value}`),
              testID: `meal-actions-meal-${value}`,
            }))}
            value={mealType}
            onChange={(next) => {
              setMealType(next);
              setToMealType(next);
            }}
            accessibilityLabel={t('tracker.savedMeals.mealToSave')}
          />
          <Text testID="meal-actions-count" className="text-xs text-label-secondary">
            {count === 0
              ? t('tracker.savedMeals.nothingLogged')
              : t('tracker.savedMeals.entriesLogged', { count })}
          </Text>
        </View>

        <View className="gap-2 rounded-xl border border-border bg-card p-3">
          <Text className="text-sm font-semibold text-label">{t('tracker.savedMeals.saveAs')}</Text>
          <Input
            testID="meal-actions-name"
            accessibilityLabel={t('tracker.savedMeals.nameLabel')}
            value={name}
            maxLength={SAVED_MEAL_LIMITS.nameMaxLength}
            placeholder={t('tracker.savedMeals.namePlaceholder')}
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
            {t('tracker.savedMeals.save')}
          </Button>
        </View>

        <View className="gap-2 rounded-xl border border-border bg-card p-3">
          <Text className="text-sm font-semibold text-label">{t('tracker.savedMeals.copyTo')}</Text>
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
              label: t(`tracker.meals.${value}`),
              testID: `meal-actions-to-meal-${value}`,
            }))}
            value={toMealType}
            onChange={setToMealType}
            accessibilityLabel={t('tracker.savedMeals.mealToCopy')}
          />
          {sameTarget && count > 0 && (
            <Text className="text-xs text-label-secondary">
              {t('tracker.savedMeals.sameTarget')}
            </Text>
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
            {t('tracker.savedMeals.copy')}
          </Button>
        </View>

        {saved.length > 0 && (
          <View className="gap-1.5">
            <Text
              accessibilityRole="header"
              className="text-xs font-semibold uppercase tracking-widest text-label-secondary"
            >
              {t('tracker.savedMeals.yourSaved')}
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
                    {savedMealSummaryText(t, meal.items)}
                  </Text>
                </View>
                <Pressable
                  testID={`meal-actions-delete-${meal.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={t('tracker.savedMeals.delete', { name: meal.name })}
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
