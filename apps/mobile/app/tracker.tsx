import { ActivityIndicator, Image, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ConfirmSheet, ErrorState, Screen, Text } from '@chefer/ui-mobile';
import {
  cn,
  customEntryChipLabel,
  formatDate,
  formatPortion,
  nutritionLabel,
  proteinAverageText,
  userFacingErrorMessage,
  weeklyAverageText,
} from '@chefer/utils';
import { MealTypeBadge } from '../src/features/dashboard/components/meal-type-badge';
import { TrainingDayNote } from '../src/features/dashboard/components/training-day-note';
import { NumbersModeProvider } from '../src/features/numbers-mode/numbers-mode';
import { ChangeNoticeCard } from '../src/features/nutrition/change-notice-card';
import { TargetExplainSheet } from '../src/features/nutrition/target-explain-sheet';
import { useShellV2 } from '../src/features/shell/shell-store';
import { YourDayScreen } from '../src/features/shell/tracker/your-day-screen';
import { EditEntrySheet } from '../src/features/tracker/edit-entry-sheet';
import { EditRecipeEntrySheet } from '../src/features/tracker/edit-recipe-entry-sheet';
import { invalidateDayQueries } from '../src/features/tracker/invalidate';
import { QuickAddSheet } from '../src/features/tracker/quick-add-sheet';
import { RebalanceBanner } from '../src/features/tracker/rebalance-banner';
import { RebalanceOffer } from '../src/features/tracker/rebalance-offer';
import { ScanMealCard } from '../src/features/tracker/scan-meal-card';
import { SlotOverflowButton, SlotStatusLine } from '../src/features/tracker/slot-controls';
import { SLOT_COPY, youHadText } from '../src/features/tracker/slot-copy';
import { TrackerTick } from '../src/features/tracker/tracker-tick';
import {
  planPortionOf,
  portionOptionsFor,
  useTrackerDay,
} from '../src/features/tracker/use-tracker-day';
import { getRecipeImageUrl } from '../src/lib/recipe-image';

// Tracker — port of apps/web (dashboard)/tracker/page.tsx (M2-4), with the
// search-first Log sheet, edit/undo and one-save model (T-19.1/2/3/4, UX-19).
// Deviation, deliberate: the rebalance banner + undo shows HERE, right after
// the log that caused it — web only shows it on the meal plan (F-TRK-3-2).

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

/** Legacy (Food|Gym shell) tracker — unchanged behaviour; logic in useTrackerDay. */
function LegacyTrackerScreen() {
  const {
    snap,
    utils,
    selectedDate,
    dateStr,
    isToday,
    isFuture,
    data,
    isLoading,
    isError,
    refetch,
    dayTargets,
    proteinOnly,
    slotFlow,
    average,
    quickAddOpen,
    setQuickAddOpen,
    explainOpen,
    setExplainOpen,
    copyDayOpen,
    setCopyDayOpen,
    editingEntry,
    setEditingEntry,
    setEditingRecipeEntryId,
    targetsView,
    deleteCustomMutation,
    deleteEntriesMutation,
    updateRecipeEntryMutation,
    copyDayMutation,
    planned,
    states,
    toggleMeal,
    setPortion,
    changeDate,
    deleteCustomEntry,
    copyLabel,
    confirmCopyDay,
    editingRecipeEntry,
    deleteOffPlanEntry,
    alsoEaten,
    checked,
    portionOf,
    loggedKcal,
    loggedProtein,
    loggedCarbs,
    loggedFat,
  } = useTrackerDay();

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

// 10 Oct redesign: the new shell shows "Your day" (board Tracker); the old
// Food|Gym shell keeps the screen above.
export default function TrackerScreen() {
  return useShellV2() ? <YourDayScreen /> : <LegacyTrackerScreen />;
}
