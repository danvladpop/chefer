import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ConfirmSheet, ErrorState, Screen, Text, useSnackbar } from '@chefer/ui-mobile';
import {
  cn,
  customEntryChipLabel,
  customEntryRows,
  formatPortion,
  localDateStr,
  plannedRowKey,
  slotPortion,
  sumLogged,
  tickStateFromLog,
  userFacingErrorMessage,
  type CustomEntryRow,
} from '@chefer/utils';
import { MealTypeBadge } from '../src/features/dashboard/components/meal-type-badge';
import { TrainingDayNote } from '../src/features/dashboard/components/training-day-note';
import { ChangeNoticeCard } from '../src/features/nutrition/change-notice-card';
import { TargetExplainSheet } from '../src/features/nutrition/target-explain-sheet';
import { EditEntrySheet } from '../src/features/tracker/edit-entry-sheet';
import { EditRecipeEntrySheet } from '../src/features/tracker/edit-recipe-entry-sheet';
import { invalidateDayQueries } from '../src/features/tracker/invalidate';
import { QuickAddSheet } from '../src/features/tracker/quick-add-sheet';
import { RebalanceBanner } from '../src/features/tracker/rebalance-banner';
import { recordRebalance } from '../src/features/tracker/rebalance-store';
import { ScanMealCard } from '../src/features/tracker/scan-meal-card';
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
  return from.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
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

  const logSlot = (meal: PlannedRow, portionMultiplier: PortionKey, onSuccess?: () => void) => {
    logRecipeMutation.mutate(
      {
        date: dateStr,
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
      { fromDate: copyFromDateStr, toDate: dateStr },
      {
        onSuccess: (result) => {
          recordRebalance(result.rebalance);
          invalidateDayQueries(utils); // both the source and target dates
          setCopyDayOpen(false);
          snackbar.show({
            message: `Copied ${result.copiedEntryIds.length} entries`,
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
                recipeId: row.recipeId,
                mealType: row.mealType,
                portionMultiplier: row.portionMultiplier ?? 1,
              }),
          });
        },
      },
    );
  };

  const customRows = customEntryRows(data?.log?.loggedMeals ?? []);

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
  } = sumLogged(data?.log?.loggedMeals ?? []);

  return (
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
          {isToday
            ? 'Today'
            : selectedDate.toLocaleDateString('en-GB', {
                weekday: 'long',
                day: 'numeric',
                month: 'short',
              })}
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
          {/* Premium week rebalance triggered by a log on this screen */}
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
              <TargetBar
                label="Calories"
                value={loggedKcal}
                target={dayTargets?.dailyCalorieTarget ?? 2000}
              />
              <TargetBar
                label="Protein (g)"
                value={loggedProtein}
                target={dayTargets?.proteinG ?? 125}
              />
              <TargetBar label="Carbs (g)" value={loggedCarbs} target={dayTargets?.carbsG ?? 225} />
              <TargetBar label="Fat (g)" value={loggedFat} target={dayTargets?.fatG ?? 65} />
            </View>
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
              {planned.map((meal) => {
                const isChecked = checked(meal.key);
                const portion = portionOf(meal);
                return (
                  <View
                    key={meal.key}
                    className={cn(
                      'rounded-xl border p-2',
                      isChecked ? 'border-primary/30 bg-accent' : 'border-border bg-card',
                    )}
                  >
                    <Pressable
                      testID={`tracker-meal-${meal.mealType}`}
                      accessibilityRole="button"
                      accessibilityState={{ checked: isChecked }}
                      onPress={() => toggleMeal(meal)}
                      className="min-h-12 flex-row items-center gap-3"
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
                          {Math.round(meal.kcal * portion)} kcal
                          {planPortionOf(meal) !== 1 &&
                            ` · plan ${formatPortion(planPortionOf(meal))}`}
                        </Text>
                      </View>
                      <TrackerTick testID={`tracker-tick-${meal.mealType}`} checked={isChecked} />
                    </Pressable>

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
            <ScanMealCard date={dateStr} onLogged={() => invalidateDayQueries(utils, dateStr)} />
          )}

          {/* Off-plan meals (F-PM-1): logged recipes that have since left
              today's plan (regenerate or swap). Kept and counted — and, like
              custom entries, tap to edit and bin to delete with Undo
              (UX-FOOD-03). */}
          {offPlanLogged.length > 0 && (
            <View testID="tracker-off-plan" className="gap-2">
              <Text className="text-xs font-semibold uppercase tracking-widest text-gray-500">
                Also eaten
              </Text>
              {offPlanLogged.map((m) => (
                <Pressable
                  key={m.entryId ?? `${m.recipeId}:${m.mealType}`}
                  testID={`tracker-off-plan-${m.entryId ?? m.recipeId}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${m.recipeName}`}
                  disabled={!m.entryId}
                  onPress={() => setEditingRecipeEntryId(m.entryId ?? null)}
                  className="flex-row items-center gap-3 rounded-xl border border-border bg-card p-3"
                >
                  <View className="min-w-0 flex-1">
                    <Text numberOfLines={1} className="text-sm font-medium text-gray-800">
                      {m.recipeName}
                    </Text>
                    <Text className="text-xs text-gray-500">
                      {m.mealType} · {Math.round(m.kcal)} kcal
                      {(m.portionMultiplier ?? 1) !== 1 &&
                        ` · ${formatPortion(m.portionMultiplier ?? 1)}`}
                    </Text>
                  </View>
                  {m.entryId && (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Delete ${m.recipeName}`}
                      disabled={deleteEntriesMutation.isPending}
                      onPress={(e) => {
                        e.stopPropagation();
                        deleteOffPlanEntry(m);
                      }}
                      className="h-11 w-11 items-center justify-center"
                    >
                      <Ionicons name="trash-outline" size={18} color="#9ca3af" />
                    </Pressable>
                  )}
                </Pressable>
              ))}
            </View>
          )}

          {/* Custom entries (scans + quick adds) — tap to edit, bin to delete
              (bug B-34, T-19.2): both are immediate + an Undo snackbar. */}
          {customRows.length > 0 && (
            <View className="gap-2">
              <Text className="text-xs font-semibold uppercase tracking-widest text-gray-500">
                Also eaten
              </Text>
              {customRows.map((row) => (
                <Pressable
                  key={row.entryIndex}
                  testID={`tracker-custom-${row.entryIndex}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${row.name}`}
                  onPress={() => setEditingEntry(row)}
                  className="flex-row items-center gap-3 rounded-xl border border-border bg-card p-3"
                >
                  <View className="min-w-0 flex-1">
                    <View className="flex-row items-center gap-2">
                      <Text numberOfLines={1} className="shrink text-sm font-medium text-gray-800">
                        {row.name}
                      </Text>
                      <View className="rounded-full bg-gray-100 px-2 py-0.5">
                        <Text className="text-xs text-gray-500">
                          {customEntryChipLabel(row.estimatedBy)}
                        </Text>
                      </View>
                    </View>
                    <Text className="text-xs text-gray-500">{row.kcal} kcal</Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Delete ${row.name}`}
                    disabled={deleteCustomMutation.isPending}
                    onPress={(e) => {
                      e.stopPropagation();
                      deleteCustomEntry(row);
                    }}
                    className="h-11 w-11 items-center justify-center"
                  >
                    <Ionicons name="trash-outline" size={18} color="#9ca3af" />
                  </Pressable>
                </Pressable>
              ))}
            </View>
          )}
        </ScrollView>
      )}

      <QuickAddSheet
        visible={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        date={dateStr}
        onLogged={() => invalidateDayQueries(utils, dateStr)}
        plannedMeals={(data?.plannedMeals ?? []).map((m, i) => ({
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
        }))}
      />

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
  );
}
