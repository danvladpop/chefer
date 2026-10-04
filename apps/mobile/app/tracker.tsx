import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { ConfirmSheet, ErrorState, Screen, Text, useSnackbar } from '@chefer/ui-mobile';
import {
  cn,
  copyDayMessage,
  customEntryChipLabel,
  customEntryRows,
  formatDate,
  formatPortion,
  groupByMeal,
  localDateStr,
  plannedRowKey,
  slotPortion,
  slotStates,
  sumLogged,
  tickStateFromLog,
  userFacingErrorMessage,
  weeklyAverage,
  weeklyAverageText,
  type CustomEntryRow,
} from '@chefer/utils';
import { MealTypeBadge } from '../src/features/dashboard/components/meal-type-badge';
import { TrainingDayNote } from '../src/features/dashboard/components/training-day-note';
import { NumbersModeProvider, useNumbersMode } from '../src/features/numbers-mode/numbers-mode';
import { nutritionLabel, proteinAverageText } from '../src/features/numbers-mode/numbers-mode-copy';
import { ChangeNoticeCard } from '../src/features/nutrition/change-notice-card';
import { TargetExplainSheet } from '../src/features/nutrition/target-explain-sheet';
import { EditEntrySheet } from '../src/features/tracker/edit-entry-sheet';
import { EditRecipeEntrySheet } from '../src/features/tracker/edit-recipe-entry-sheet';
import { invalidateDayQueries } from '../src/features/tracker/invalidate';
import { QuickAddSheet } from '../src/features/tracker/quick-add-sheet';
import { RebalanceBanner } from '../src/features/tracker/rebalance-banner';
import { RebalanceOffer } from '../src/features/tracker/rebalance-offer';
import {
  REBALANCE_PREVIEW,
  recordRebalanceOutcome,
} from '../src/features/tracker/rebalance-offer-store';
import { ScanMealCard } from '../src/features/tracker/scan-meal-card';
import { SlotOverflowButton, SlotStatusLine } from '../src/features/tracker/slot-controls';
import { SLOT_COPY, youHadText } from '../src/features/tracker/slot-copy';
import { useSlotFlow } from '../src/features/tracker/slot-flow';
import { TrackerTick } from '../src/features/tracker/tracker-tick';
import { useTrackerWrites } from '../src/features/tracker/use-tracker-writes';
import { getRecipeImageUrl } from '../src/lib/recipe-image';
import { trpc } from '../src/lib/trpc';

// Tracker — port of apps/web (dashboard)/tracker/page.tsx (M2-4), with the
// search-first Log sheet, edit/undo and one-save model (T-19.1/2/3/4, UX-19).
// Deviation, deliberate: the rebalance banner + undo shows HERE, right after
// the log that caused it — web only shows it on the meal plan (F-TRK-3-2).

type PortionKey = number;

/**
 * A planned row's key: its plan slot, so two identical snacks are two rows
 * that tick separately (they used to share `recipeId:mealType`).
 */
const keyOf = plannedRowKey;

const PORTION_OPTIONS: PortionKey[] = [0.5, 1, 1.5, 2];

/**
 * P1-1: a planned meal's default portion is its plan slot's (a curated day
 * sized to 1¼× logs 1¼×), within the tracker's 0.5–2 range — same rule as
 * web. The picker gets that portion as an extra option when it's not one of
 * the four.
 */
const planPortionOf = (meal: { portion?: number }): PortionKey =>
  Math.min(2, Math.max(0.5, slotPortion(meal.portion)));
const portionOptionsFor = (meal: { portion?: number }): PortionKey[] =>
  [...new Set([...PORTION_OPTIONS, planPortionOf(meal)])].sort((a, b) => a - b);

// Local calendar day, not the UTC one (F-TRK-1-1).
const toDateStr = (d: Date): string => localDateStr(d);

function addDays(d: Date, delta: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + delta);
  return next;
}

/** "yesterday" when `from` is the calendar day before `to`, else a short date. */
function relativeDayLabel(from: Date, to: Date): string {
  const diffDays = Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays === 1) return 'yesterday';
  return formatDate(from, 'weekday-short');
}

function TargetBar({ label, value, target }: { label: string; value: number; target: number }) {
  const pct = Math.min(Math.round((value / (target || 1)) * 100), 100);
  return (
    <View>
      <View className="mb-1 flex-row justify-between">
        <Text className="text-xs font-medium text-gray-700">{label}</Text>
        <Text className="text-xs text-gray-500">
          {Math.round(value)} / {target}
        </Text>
      </View>
      <View className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
        <View className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </View>
    </View>
  );
}

export default function TrackerScreen() {
  // UX-ACC-13: `?snap=1` (the post-upgrade "Snap your next meal" CTA) opens the
  // photo picker as soon as the Snap card is there.
  const { snap } = useLocalSearchParams<{ snap?: string }>();
  const snackbar = useSnackbar();
  const utils = trpc.useUtils();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const dateStr = toDateStr(selectedDate);
  const todayStr = toDateStr(new Date());
  const isToday = todayStr === dateStr;
  const isFuture = selectedDate > new Date() && !isToday;

  const { data, isLoading, isError, refetch } = trpc.tracker.getDay.useQuery(
    { date: dateStr },
    { enabled: !isFuture, staleTime: 30_000 },
  );
  // Same targets as Today: a premium lifter's training day swaps in the
  // bumped targets (audit P2-4); everyone else keeps the base.
  const dayTargets = data?.adjustedTargets ?? data?.targets;
  // WP-08: the day's payload decides protein-only (no kcal in rows or totals).
  const { proteinOnly } = useNumbersMode(data?.numbersMode);

  // WP-06: "Ate something else" / "Skipped it" on every planned row.
  const slotFlow = useSlotFlow(dateStr);
  // The week's average is the number this screen praises (Food 2); one day over
  // or under is just reported.
  const { data: week } = trpc.tracker.weeklySummary.useQuery(
    { localDate: todayStr },
    { staleTime: 60_000 },
  );
  const average = week ? weeklyAverage(week.days, todayStr) : null;

  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [explainOpen, setExplainOpen] = useState(false);
  const [copyDayOpen, setCopyDayOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<CustomEntryRow | null>(null);
  const [editingRecipeEntryId, setEditingRecipeEntryId] = useState<string | null>(null);

  // §2.11, T-11.2: the same resolved view targets.get exposes, for "Why this
  // number" (AC3, tapping the totals card). A no-op fetch when the sheet
  // never opens — enabled only once tapped keeps this off the tracker's
  // critical path.
  const { data: targetsView } = trpc.targets.get.useQuery(undefined, { enabled: explainOpen });

  // UX-FOOD-01: ticks and totals are DERIVED from the cached day on every
  // render — there is no once-a-day copy in component state, so Undo, a log
  // made on Today or a write that failed can never leave the screen out of
  // step with the server. Taps edit that cached day optimistically (see
  // useTrackerWrites: rolled back on error, re-fetched on settle).
  const ticks = tickStateFromLog(data?.plannedMeals ?? [], data?.log?.loggedMeals ?? []);

  // ─── One-save model (bug B-23, T-19.4) — every tick/portion change saves
  // immediately through logRecipe/unlogRecipe; there is no Save Day. ────────
  const {
    logRecipe: logRecipeMutation,
    unlogRecipe: unlogRecipeMutation,
    deleteCustom: deleteCustomMutation,
    deleteEntries: deleteEntriesMutation,
    restoreCustom: restoreCustomMutation,
    updateRecipeEntry: updateRecipeEntryMutation,
  } = useTrackerWrites(dateStr);
  const copyDayMutation = trpc.tracker.copyDay.useMutation({ meta: { silent: true } });

  const planned = (data?.plannedMeals ?? []).map((m, i) => ({ ...m, key: keyOf(m, i) }));
  type PlannedRow = (typeof planned)[number];

  // WP-06: what became of each planned slot — eaten as planned, replaced by
  // something else ("You had: …"), skipped, or still to eat. One helper for
  // every surface; `states` lines up with `planned`.
  const loggedMeals = data?.log?.loggedMeals ?? [];
  const states = slotStates(
    planned.map((m, i) => ({
      type: m.mealType,
      recipeId: m.recipeId,
      slotIndex: m.slotIndex ?? i,
    })),
    loggedMeals,
    data?.skippedSlots ?? [],
  );
  const replacedEntries = states.flatMap((st) => (st.status === 'replaced' ? [st.entry] : []));
  const replacedIndexes = new Set(replacedEntries.map((e) => loggedMeals.indexOf(e)));
  const logSlot = (meal: PlannedRow, portionMultiplier: PortionKey, onSuccess?: () => void) => {
    logRecipeMutation.mutate(
      {
        date: dateStr,
        ...REBALANCE_PREVIEW,
        recipeId: meal.recipeId,
        mealType: meal.mealType,
        portionMultiplier,
        ...(meal.slotIndex !== undefined && { slotIndex: meal.slotIndex }),
      },
      onSuccess ? { onSuccess } : {},
    );
  };
  const unlogSlot = (meal: PlannedRow, onSuccess?: () => void) => {
    unlogRecipeMutation.mutate(
      {
        date: dateStr,
        recipeId: meal.recipeId,
        mealType: meal.mealType,
        ...(meal.slotIndex !== undefined && { slotIndex: meal.slotIndex }),
      },
      onSuccess ? { onSuccess } : {},
    );
  };

  // The snackbar confirms only once the server has said yes (UX-FOOD-06): a
  // failed write shows the reason instead (useTrackerWrites) and the tick
  // goes back.
  const toggleMeal = (meal: PlannedRow) => {
    const wasChecked = ticks[meal.key]?.checked ?? false;
    const portion = ticks[meal.key]?.portion ?? planPortionOf(meal);
    if (!wasChecked) {
      logSlot(meal, portion, () =>
        snackbar.show({
          message: `Logged ${meal.mealType}`,
          actionLabel: 'Undo',
          onAction: () => unlogSlot(meal),
          tone: 'success',
        }),
      );
    } else {
      unlogSlot(meal, () =>
        snackbar.show({
          message: `Removed ${meal.mealType}`,
          actionLabel: 'Undo',
          onAction: () => logSlot(meal, portion),
        }),
      );
    }
  };

  const setPortion = (meal: PlannedRow, portion: PortionKey) => logSlot(meal, portion);

  const changeDate = (delta: number) => {
    setSelectedDate((d) => addDays(d, delta));
  };

  const deleteCustomEntry = (row: CustomEntryRow) => {
    if (deleteCustomMutation.isPending) return;
    const entryId = row.entryId;
    deleteCustomMutation.mutate(
      // UX-FOOD-17: by stable id when the row has one (the index is only the
      // fallback for an entry that has none yet).
      entryId
        ? { date: dateStr, entryId, entryIndex: row.entryIndex }
        : { date: dateStr, entryIndex: row.entryIndex },
      {
        onSuccess: () => {
          snackbar.show({
            message: `Deleted ${row.name}`,
            actionLabel: entryId ? 'Undo' : undefined,
            onAction: entryId
              ? () =>
                  restoreCustomMutation.mutate({
                    date: dateStr,
                    entry: {
                      entryId,
                      custom: { name: row.name, estimatedBy: row.estimatedBy },
                      mealType: row.mealType,
                      portionMultiplier: 1,
                      kcal: row.kcal,
                      protein: row.protein,
                      carbs: row.carbs,
                      fat: row.fat,
                      ...(row.unknownMacros && { unknownMacros: [...row.unknownMacros] }),
                      ...(row.replacesSlot && { replacesSlot: row.replacesSlot }),
                    },
                  })
              : undefined,
          });
        },
      },
    );
  };

  const copyFromDate = addDays(selectedDate, -1);
  const copyFromDateStr = toDateStr(copyFromDate);
  const copyLabel = relativeDayLabel(copyFromDate, selectedDate);

  const confirmCopyDay = () => {
    copyDayMutation.mutate(
      { fromDate: copyFromDateStr, toDate: dateStr, ...REBALANCE_PREVIEW },
      {
        onSuccess: (result) => {
          recordRebalanceOutcome(result);
          invalidateDayQueries(utils); // both the source and target dates
          setCopyDayOpen(false);
          snackbar.show({
            message: copyDayMessage(result.copiedEntryIds.length, copyLabel),
            actionLabel: result.copiedEntryIds.length > 0 ? 'Undo' : undefined,
            onAction:
              result.copiedEntryIds.length > 0
                ? () =>
                    deleteEntriesMutation.mutate({ date: dateStr, entryIds: result.copiedEntryIds })
                : undefined,
          });
        },
      },
    );
  };

  // Off-plan recipe rows (UX-FOOD-03): editable and removable like custom
  // entries — they used to be read-only, so a mis-log or a stale one could
  // never be fixed.
  const offPlanLogged = data?.offPlanLogged ?? [];
  const editingRecipeEntry = offPlanLogged.find((m) => m.entryId === editingRecipeEntryId) ?? null;
  const deleteOffPlanEntry = (row: (typeof offPlanLogged)[number]) => {
    const entryId = row.entryId;
    if (!entryId) return;
    deleteEntriesMutation.mutate(
      { date: dateStr, entryIds: [entryId] },
      {
        onSuccess: () => {
          setEditingRecipeEntryId(null);
          snackbar.show({
            message: `Deleted ${row.recipeName}`,
            actionLabel: 'Undo',
            // The entry is re-logged exactly as it was (recipe, meal, portion).
            onAction: () =>
              logRecipeMutation.mutate({
                date: dateStr,
                ...REBALANCE_PREVIEW,
                recipeId: row.recipeId,
                mealType: row.mealType,
                portionMultiplier: row.portionMultiplier ?? 1,
              }),
          });
        },
      },
    );
  };

  // A replacement sits on its slot ("You had: …"), so it is not listed again
  // here. One whose slot is gone from the plan (regenerated since) still is.
  const customRows = customEntryRows(loggedMeals).filter((r) => !replacedIndexes.has(r.entryIndex));

  // UX-FOOD-25: off-plan recipes and custom entries are ONE "Also eaten" list,
  // grouped under the meal they belong to (they were two stacked sections
  // with the same header, and the custom rows sat under the Snap upsell).
  const alsoEaten = groupByMeal([
    ...offPlanLogged.map((m) => ({ kind: 'recipe' as const, mealType: m.mealType, m })),
    ...customRows.map((row) => ({ kind: 'custom' as const, mealType: row.mealType, row })),
  ]);

  const checked = (key: string) => ticks[key]?.checked ?? false;
  const portionOf = (m: { key: string; portion?: number }): PortionKey =>
    ticks[m.key]?.portion ?? planPortionOf(m);

  // The day's totals are whatever the log holds — planned ticks, custom
  // entries and off-plan recipes alike (the server's own definition).
  const {
    kcal: loggedKcal,
    protein: loggedProtein,
    carbs: loggedCarbs,
    fat: loggedFat,
  } = sumLogged(loggedMeals);

  return (
    <NumbersModeProvider mode={data?.numbersMode}>
      <Screen edges={['top', 'bottom', 'left', 'right']} className="px-0">
        {/* Header */}
        <View className="flex-row items-center gap-3 px-4 py-3">
          <Pressable
            testID="tracker-close"
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={() => router.back()}
            className="h-11 w-11 items-center justify-center"
          >
            <Ionicons name="arrow-back" size={20} color="#1f2937" />
          </Pressable>
          <Text testID="tracker-title" variant="title" className="flex-1">
            Tracker
          </Text>
          <Pressable
            testID="tracker-copy-day"
            accessibilityRole="button"
            accessibilityLabel={`Copy ${copyLabel} to ${isToday ? 'today' : 'this day'}`}
            onPress={() => {
              copyDayMutation.reset();
              setCopyDayOpen(true);
            }}
            className="h-11 w-11 items-center justify-center"
          >
            <Ionicons name="copy-outline" size={20} color="#6b7280" />
          </Pressable>
        </View>

        {/* Date navigator */}
        <View className="flex-row items-center justify-between px-4 pb-2">
          <Pressable
            testID="tracker-prev-day"
            accessibilityRole="button"
            accessibilityLabel="Previous day"
            onPress={() => changeDate(-1)}
            className="h-11 w-11 items-center justify-center rounded-lg border border-border"
          >
            <Ionicons name="chevron-back" size={18} color="#6b7280" />
          </Pressable>
          <Text className="text-sm font-medium text-gray-700">
            {isToday ? 'Today' : formatDate(selectedDate, 'weekday-long-short')}
          </Text>
          <Pressable
            testID="tracker-next-day"
            accessibilityRole="button"
            accessibilityLabel="Next day"
            disabled={isToday}
            onPress={() => changeDate(1)}
            className={cn(
              'h-11 w-11 items-center justify-center rounded-lg border border-border',
              isToday && 'opacity-40',
            )}
          >
            <Ionicons name="chevron-forward" size={18} color="#6b7280" />
          </Pressable>
        </View>

        {isLoading && !isFuture ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color="#944a00" />
          </View>
        ) : isError && !data && !isFuture ? (
          <ErrorState
            title="Couldn't load this day"
            icon={<Ionicons name="cloud-offline-outline" size={40} color="#9ca3af" />}
            onRetry={() => void refetch()}
          />
        ) : (
          <ScrollView
            contentContainerClassName="gap-4 px-4 py-2 pb-8"
            keyboardShouldPersistTaps="handled"
          >
            {/* A log on this screen can offer to rebalance the week (free, WP-07) */}
            <RebalanceOffer />
            <RebalanceBanner />

            {/* Target change notice (§2.11, T-11.1/T-11.5) — never a silent change */}
            <ChangeNoticeCard />

            {/* Totals vs targets */}
            <View
              testID="tracker-totals"
              className="gap-3 rounded-xl border border-border bg-card p-4"
            >
              <View className="mb-1 flex-row items-center justify-between">
                <Text className="text-xs font-semibold uppercase tracking-widest text-gray-500">
                  Logged {isToday ? 'Today' : 'This Day'}
                </Text>
                {/* UX-11 AC3: tapping the day totals opens "Why this number". */}
                <Pressable
                  testID="tracker-why-target"
                  accessibilityRole="button"
                  accessibilityLabel="Why this target"
                  onPress={() => setExplainOpen(true)}
                  className="h-11 w-11 items-center justify-center"
                >
                  <Ionicons name="information-circle-outline" size={20} color="#9ca3af" />
                </Pressable>
              </View>
              {data?.trainingDay && <TrainingDayNote t={data.trainingDay} isToday={isToday} />}
              <View className="gap-3">
                {!proteinOnly && (
                  <TargetBar
                    label="Calories"
                    value={loggedKcal}
                    target={dayTargets?.dailyCalorieTarget ?? 2000}
                  />
                )}
                <TargetBar
                  label="Protein (g)"
                  value={loggedProtein}
                  target={dayTargets?.proteinG ?? 125}
                />
                {!proteinOnly && (
                  <>
                    <TargetBar
                      label="Carbs (g)"
                      value={loggedCarbs}
                      target={dayTargets?.carbsG ?? 225}
                    />
                    <TargetBar label="Fat (g)" value={loggedFat} target={dayTargets?.fatG ?? 65} />
                  </>
                )}
              </View>
              {proteinOnly && data?.proteinGuide && (
                <Text testID="tracker-protein-guide" className="text-xs text-gray-600">
                  {data.proteinGuide.label}
                </Text>
              )}
              {average && (
                <Text testID="tracker-weekly-average" className="text-xs text-gray-600">
                  {proteinOnly ? proteinAverageText(average) : weeklyAverageText(average)}
                </Text>
              )}
            </View>

            {/* Planned meals to check off */}
            {(data?.plannedMeals ?? []).length === 0 ? (
              <View
                testID="tracker-empty-plan"
                className="items-center gap-3 rounded-xl border border-border bg-card py-8"
              >
                {data?.hasActivePlan === false ? (
                  // T-19.6: a Track-only user may never generate a plan — this
                  // reads as an invitation to log, not a missing-plan error.
                  <>
                    <Ionicons name="restaurant-outline" size={28} color="#9ca3af" />
                    <Text
                      testID="tracker-empty-plan-text"
                      variant="muted"
                      className="text-center text-sm"
                    >
                      No plan today — log from Recent or search below.
                    </Text>
                  </>
                ) : (
                  <Text testID="tracker-empty-plan-text" variant="muted">
                    No planned meals for this day.
                  </Text>
                )}
              </View>
            ) : (
              <View className="gap-2">
                {planned.map((meal, i) => {
                  const state = states[i];
                  const isChecked = checked(meal.key);
                  const portion = portionOf(meal);
                  const slot = { mealType: meal.mealType, slotIndex: meal.slotIndex ?? i };

                  // WP-06: swapped for something else — says what you had, can't be
                  // ticked again, and the planned meal can come back with Remove.
                  if (state?.status === 'replaced') {
                    const entry = state.entry;
                    const entryId = entry.entryId;
                    return (
                      <View
                        key={meal.key}
                        testID={`tracker-meal-${meal.mealType}`}
                        className="gap-1 rounded-xl border border-border bg-muted p-3"
                      >
                        <MealTypeBadge mealType={meal.mealType} />
                        <SlotStatusLine
                          testID={`tracker-slot-replaced-${meal.key}`}
                          text={youHadText(entry, proteinOnly)}
                          actionLabel={entryId ? SLOT_COPY.remove : undefined}
                          onAction={
                            entryId && entry.custom
                              ? () =>
                                  slotFlow.actions.removeReplacement({
                                    entryId,
                                    name: entry.custom?.name ?? 'Something else',
                                    estimatedBy: entry.custom?.estimatedBy ?? 'manual',
                                    kcal: entry.kcal,
                                    protein: entry.protein,
                                    carbs: entry.carbs,
                                    fat: entry.fat,
                                    unknownMacros: entry.unknownMacros,
                                    replacesSlot: slot,
                                  })
                              : undefined
                          }
                        />
                        <Text numberOfLines={1} className="text-xs text-gray-500">
                          Planned: {meal.recipeName}
                        </Text>
                      </View>
                    );
                  }

                  // WP-06: skipped — muted, neither eaten nor remaining; Undo puts it back.
                  if (state?.status === 'skipped') {
                    return (
                      <View
                        key={meal.key}
                        testID={`tracker-meal-${meal.mealType}`}
                        className="gap-1 rounded-xl border border-border bg-muted p-3"
                      >
                        <MealTypeBadge mealType={meal.mealType} />
                        <Text numberOfLines={1} className="text-sm text-gray-500">
                          {meal.recipeName}
                        </Text>
                        <SlotStatusLine
                          testID={`tracker-slot-skipped-${meal.key}`}
                          text={SLOT_COPY.skippedLabel}
                          actionLabel={SLOT_COPY.undo}
                          onAction={() => slotFlow.actions.unskipSlot(slot)}
                        />
                      </View>
                    );
                  }

                  return (
                    <View
                      key={meal.key}
                      className={cn(
                        'rounded-xl border p-2',
                        isChecked ? 'border-primary/30 bg-accent' : 'border-border bg-card',
                      )}
                    >
                      <View className="flex-row items-center">
                        <Pressable
                          testID={`tracker-meal-${meal.mealType}`}
                          accessibilityRole="button"
                          accessibilityState={{ checked: isChecked }}
                          onPress={() => toggleMeal(meal)}
                          className="min-h-12 min-w-0 flex-1 flex-row items-center gap-3"
                        >
                          <Image
                            source={{ uri: getRecipeImageUrl(meal.imageUrl) }}
                            className="h-12 w-12 rounded-lg"
                            resizeMode="cover"
                          />
                          <View className="min-w-0 flex-1">
                            <MealTypeBadge mealType={meal.mealType} />
                            <Text
                              numberOfLines={1}
                              className="mt-0.5 text-sm font-medium text-gray-800"
                            >
                              {meal.recipeName}
                            </Text>
                            <Text className="text-xs text-gray-500">
                              {nutritionLabel(
                                { kcal: meal.kcal * portion, protein: meal.protein * portion },
                                proteinOnly,
                              )}
                              {planPortionOf(meal) !== 1 &&
                                ` · plan ${formatPortion(planPortionOf(meal))}`}
                            </Text>
                          </View>
                          <TrackerTick
                            testID={`tracker-tick-${meal.mealType}`}
                            checked={isChecked}
                          />
                        </Pressable>
                        {/* WP-06: only a meal still to eat can be swapped or skipped. */}
                        {!isChecked && (
                          <SlotOverflowButton
                            testID={`tracker-slot-actions-${meal.key}`}
                            mealType={meal.mealType}
                            onPress={() => slotFlow.openMenu({ ...slot, name: meal.recipeName })}
                          />
                        )}
                      </View>

                      {isChecked && (
                        <View className="mt-2 flex-row gap-1.5">
                          {portionOptionsFor(meal).map((p) => (
                            <Pressable
                              key={p}
                              accessibilityRole="button"
                              onPress={() => setPortion(meal, p)}
                              className={cn(
                                'min-h-11 flex-1 items-center justify-center rounded-lg border',
                                portion === p
                                  ? 'border-primary bg-primary'
                                  : 'border-border bg-white',
                              )}
                            >
                              <Text
                                className={cn(
                                  'text-xs font-semibold',
                                  portion === p ? 'text-primary-foreground' : 'text-gray-600',
                                )}
                              >
                                {formatPortion(p)}
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            )}

            {/* Also eaten — off-plan recipes (F-PM-1: logged, then left today's
              plan) and custom entries (scans + quick adds), one list grouped
              by meal. Tap to edit, bin to delete with Undo (UX-FOOD-03,
              bug B-34, T-19.2, UX-FOOD-25). */}
            {alsoEaten.length > 0 && (
              <View testID="tracker-also-eaten" className="gap-2">
                <Text
                  accessibilityRole="header"
                  className="text-xs font-semibold uppercase tracking-widest text-gray-500"
                >
                  Also eaten
                </Text>
                {alsoEaten.map((group) => (
                  <View
                    key={group.mealType}
                    testID={`tracker-also-eaten-${group.mealType}`}
                    className="gap-2"
                  >
                    <MealTypeBadge mealType={group.mealType} />
                    {group.rows.map((item) =>
                      item.kind === 'recipe' ? (
                        <Pressable
                          key={item.m.entryId ?? `${item.m.recipeId}:${item.m.mealType}`}
                          testID={`tracker-off-plan-${item.m.entryId ?? item.m.recipeId}`}
                          accessibilityRole="button"
                          accessibilityLabel={`Edit ${item.m.recipeName}`}
                          disabled={!item.m.entryId}
                          onPress={() => setEditingRecipeEntryId(item.m.entryId ?? null)}
                          className="flex-row items-center gap-3 rounded-xl border border-border bg-card p-3"
                        >
                          <View className="min-w-0 flex-1">
                            <Text numberOfLines={1} className="text-sm font-medium text-gray-800">
                              {item.m.recipeName}
                            </Text>
                            <Text className="text-xs text-gray-500">
                              {nutritionLabel(item.m, proteinOnly)}
                              {(item.m.portionMultiplier ?? 1) !== 1 &&
                                ` · ${formatPortion(item.m.portionMultiplier ?? 1)}`}
                            </Text>
                          </View>
                          {item.m.entryId && (
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={`Delete ${item.m.recipeName}`}
                              disabled={deleteEntriesMutation.isPending}
                              onPress={(e) => {
                                e.stopPropagation();
                                deleteOffPlanEntry(item.m);
                              }}
                              className="h-11 w-11 items-center justify-center"
                            >
                              <Ionicons name="trash-outline" size={18} color="#9ca3af" />
                            </Pressable>
                          )}
                        </Pressable>
                      ) : (
                        <Pressable
                          key={item.row.entryIndex}
                          testID={`tracker-custom-${item.row.entryIndex}`}
                          accessibilityRole="button"
                          accessibilityLabel={`Edit ${item.row.name}`}
                          onPress={() => setEditingEntry(item.row)}
                          className="flex-row items-center gap-3 rounded-xl border border-border bg-card p-3"
                        >
                          <View className="min-w-0 flex-1">
                            <View className="flex-row items-center gap-2">
                              <Text
                                numberOfLines={1}
                                className="shrink text-sm font-medium text-gray-800"
                              >
                                {item.row.name}
                              </Text>
                              <View className="rounded-full bg-gray-100 px-2 py-0.5">
                                <Text className="text-xs text-gray-500">
                                  {customEntryChipLabel(item.row.estimatedBy)}
                                </Text>
                              </View>
                            </View>
                            <Text className="text-xs text-gray-500">
                              {nutritionLabel(item.row, proteinOnly)}
                            </Text>
                          </View>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Delete ${item.row.name}`}
                            disabled={deleteCustomMutation.isPending}
                            onPress={(e) => {
                              e.stopPropagation();
                              deleteCustomEntry(item.row);
                            }}
                            className="h-11 w-11 items-center justify-center"
                          >
                            <Ionicons name="trash-outline" size={18} color="#9ca3af" />
                          </Pressable>
                        </Pressable>
                      ),
                    )}
                  </View>
                ))}
              </View>
            )}

            {/* Log something (T-19.1) — search-first sheet, any day, for
              off-plan food or a repeat from Recent. */}
            <Pressable
              testID="tracker-quick-add"
              accessibilityRole="button"
              onPress={() => setQuickAddOpen(true)}
              className="h-11 flex-row items-center justify-center gap-1.5 rounded-md border border-border"
            >
              <Ionicons name="add" size={18} color="#944a00" />
              <Text className="text-sm font-medium text-primary">Log something</Text>
            </Pressable>

            {/* Snap-to-Log (F4 / M3-2) — today only; past days are typed by hand */}
            {isToday && (
              <ScanMealCard
                date={dateStr}
                onLogged={() => invalidateDayQueries(utils, dateStr)}
                autoPick={snap === '1'}
                onAutoPicked={() => router.setParams({ snap: undefined })}
              />
            )}
          </ScrollView>
        )}

        <QuickAddSheet
          visible={quickAddOpen}
          onClose={() => setQuickAddOpen(false)}
          date={dateStr}
          onLogged={() => invalidateDayQueries(utils, dateStr)}
          plannedMeals={(data?.plannedMeals ?? []).flatMap((m, i) =>
            // A slot the user swapped for something else is not offered again (WP-06).
            states[i]?.status === 'replaced'
              ? []
              : [
                  {
                    recipeId: m.recipeId,
                    recipeName: m.recipeName,
                    mealType: m.mealType,
                    imageUrl: m.imageUrl,
                    kcal: m.kcal,
                    protein: m.protein,
                    carbs: m.carbs,
                    fat: m.fat,
                    ...(m.portion !== undefined && { portion: m.portion }),
                    slotIndex: m.slotIndex ?? i,
                  },
                ],
          )}
        />

        {slotFlow.host}

        <EditEntrySheet
          visible={editingEntry !== null}
          onClose={() => setEditingEntry(null)}
          date={dateStr}
          entry={editingEntry}
          onSaved={() => invalidateDayQueries(utils, dateStr)}
          onDeleted={() => setEditingEntry(null)}
        />

        <EditRecipeEntrySheet
          visible={editingRecipeEntry !== null}
          onClose={() => setEditingRecipeEntryId(null)}
          entry={editingRecipeEntry}
          onSave={(edit) => {
            if (!editingRecipeEntry?.entryId) return;
            updateRecipeEntryMutation.mutate({
              date: dateStr,
              entryId: editingRecipeEntry.entryId,
              ...edit,
            });
            setEditingRecipeEntryId(null);
          }}
          onDelete={() => editingRecipeEntry && deleteOffPlanEntry(editingRecipeEntry)}
        />

        <TargetExplainSheet
          visible={explainOpen}
          onClose={() => setExplainOpen(false)}
          view={targetsView}
        />

        <ConfirmSheet
          visible={copyDayOpen}
          onClose={() => setCopyDayOpen(false)}
          title="Copy day"
          body={`Copy everything logged ${copyLabel} to ${isToday ? 'today' : 'this day'}? You can undo it right after.`}
          confirmLabel={
            copyDayMutation.isPending
              ? 'Copying…'
              : `Copy ${copyLabel} to ${isToday ? 'today' : 'this day'}`
          }
          cancelLabel="Cancel"
          onConfirm={confirmCopyDay}
          // UX-X-13: a failed copy stays in the sheet with the reason (and a
          // retry) instead of closing and flashing a snackbar.
          busy={copyDayMutation.isPending}
          error={
            copyDayMutation.isError
              ? `Couldn't copy the day. ${userFacingErrorMessage(copyDayMutation.error)}`
              : null
          }
          testID="tracker-copy-day-confirm"
        />
      </Screen>
    </NumbersModeProvider>
  );
}
