import { useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import {
  ConfirmSheet,
  ErrorState,
  haptics,
  IconButton,
  MediaFrame,
  PressableScale,
  Screen,
  Text,
  useThemeColors,
} from '@chefer/ui-mobile';
import {
  cn,
  customEntryChipLabel,
  formatDate,
  formatPortion,
  metaLine,
  nutritionLabel,
  portionLabel,
  userFacingErrorMessage,
} from '@chefer/utils';
import { Icon } from '../../../components/icon';
import { useT } from '../../../lib/i18n';
import { getRecipeImageUrl } from '../../../lib/recipe-image';
import { TrainingDayNote } from '../../dashboard/components/training-day-note';
import { NumbersModeProvider } from '../../numbers-mode/numbers-mode';
import { ChangeNoticeCard } from '../../nutrition/change-notice-card';
import { TargetExplainSheet } from '../../nutrition/target-explain-sheet';
import { DayFitNote } from '../../tracker/day-fit-note';
import { EditEntrySheet } from '../../tracker/edit-entry-sheet';
import { EditRecipeEntrySheet } from '../../tracker/edit-recipe-entry-sheet';
import { invalidateDayQueries } from '../../tracker/invalidate';
import { MealActionsSheet } from '../../tracker/meal-actions-sheet';
import { PartlyLoggedRow } from '../../tracker/partly-logged-row';
import { QuickAddSheet } from '../../tracker/quick-add-sheet';
import { RebalanceBanner } from '../../tracker/rebalance-banner';
import { RebalanceOffer } from '../../tracker/rebalance-offer';
import { ScanMealCard } from '../../tracker/scan-meal-card';
import { moreActionsLabel, SLOT_COPY, youHadText } from '../../tracker/slot-copy';
import { planPortionOf, portionOptionsFor, useTrackerDay } from '../../tracker/use-tracker-day';
import { ShellChromeProvider, ShellTopBar } from '../shell-chrome';
import { NutritionCard } from '../today/nutrition-card';
import { ActionButton, BoardCard, SectionTitle } from '../today/parts';
import { mealTypeLabel } from '../today/today-helpers';

// ─── Your day (10 Oct redesign, board Tracker) ──────────────────────────────
// The tracker in the new shell, reached from Today's "Open your day": the
// same day model and writes as the old Tracker (useTrackerDay — ticks and
// totals derived from the cached day, one-save model, copy day, edit and
// delete with Undo, "Ate something else" / "Skipped it", `snap=1` and
// `copy=1`), drawn with the redesign's parts: the half-ring gauge and macro
// rows instead of the "Logged today" bars, framed photos on the planned
// rows and the copy action in the top bar. The week's average line is gone
// from here (Stats has the averages).

function Tick({ checked }: { checked: boolean }) {
  const colors = useThemeColors();
  return (
    <View className="h-12 w-12 items-center justify-center">
      <View
        className={cn(
          'h-9 w-9 items-center justify-center rounded-full',
          checked ? 'bg-positive' : 'border-2 border-separator',
        )}
      >
        {checked ? <Icon name="checkmark" color={colors.onBrand} size={20} /> : null}
      </View>
    </View>
  );
}

function StatusLine({
  text,
  actionLabel,
  onAction,
  testID,
}: {
  text: string;
  actionLabel?: string | undefined;
  onAction?: (() => void) | undefined;
  testID: string;
}) {
  return (
    <View testID={testID} className="flex-row items-center gap-2">
      <Text className="min-w-0 flex-1 text-subhead text-label-secondary">{text}</Text>
      {actionLabel && onAction ? (
        <PressableScale
          testID={`${testID}-action`}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          onPress={onAction}
          className="min-h-11 justify-center px-2"
        >
          <Text className="text-callout font-semibold text-brand">{actionLabel}</Text>
        </PressableScale>
      ) : null}
    </View>
  );
}

export function YourDayScreen() {
  const colors = useThemeColors();
  const { t } = useT();
  const day = useTrackerDay({ weeklyAverage: false });
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
    noNumbers,
    slotFlow,
    planned,
    states,
  } = day;

  const dateLabel = isToday
    ? t('tracker.page.todayDate', {
        date: formatDate(selectedDate, 'weekday-short').replace(',', ''),
      })
    : formatDate(selectedDate, 'weekday-short').replace(',', '');

  const [mealActionsOpen, setMealActionsOpen] = useState(false);
  const copyAction = (
    <View className="flex-row gap-2">
      <IconButton
        testID="tracker-meal-actions"
        accessibilityLabel={t('tracker.savedMeals.actionsTitle')}
        variant="tinted"
        icon={<Icon name="meals" color={colors.brand} size={20} />}
        onPress={() => setMealActionsOpen(true)}
      />
      <IconButton
        testID="tracker-copy-day"
        accessibilityLabel={
          isToday
            ? t('tracker.page.copyToToday', { from: day.copyLabel })
            : t('tracker.page.copyToThisDay', { from: day.copyLabel })
        }
        variant="tinted"
        icon={<Icon name="copy" color={colors.brand} size={20} />}
        onPress={() => {
          day.copyDayMutation.reset();
          day.setCopyDayOpen(true);
        }}
      />
    </View>
  );

  // The also-eaten list, flat: meal type and "estimated" move into each row's meta line.
  const alsoEatenRows = day.alsoEaten.flatMap((group) => group.rows);

  return (
    <NumbersModeProvider mode={data?.numbersMode}>
      <ShellChromeProvider
        value={{
          kind: 'pushed',
          fallback: '/home',
          title: t('tracker.page.yourDay'),
          actions: copyAction,
        }}
      >
        <Screen edges={['top', 'bottom', 'left', 'right']} className="bg-canvas px-0">
          <View className="gap-2 px-4 pb-2 pt-3">
            <ShellTopBar />
            {/* Date navigator */}
            <View className="flex-row items-center justify-between">
              <IconButton
                testID="tracker-prev-day"
                accessibilityLabel={t('tracker.page.prevDay')}
                variant="tinted"
                icon={<Icon name="chevronBack" color={colors.brand} size={20} />}
                onPress={() => day.changeDate(-1)}
              />
              <Text testID="tracker-date" className="text-headline font-bold text-label">
                {dateLabel}
              </Text>
              <IconButton
                testID="tracker-next-day"
                accessibilityLabel={t('tracker.page.nextDay')}
                variant="tinted"
                disabled={isToday}
                icon={<Icon name="chevronRight" color={colors.brand} size={20} />}
                onPress={() => day.changeDate(1)}
              />
            </View>
          </View>

          {isLoading && !isFuture ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator size="large" color={colors.brand} />
            </View>
          ) : isError && !data && !isFuture ? (
            <ErrorState
              title={t('tracker.page.loadError')}
              icon={<Icon name="refresh" color={colors.labelTertiary} size={40} />}
              onRetry={() => void refetch()}
            />
          ) : (
            <ScrollView
              contentContainerClassName="gap-4 px-4 pb-8 pt-2"
              keyboardShouldPersistTaps="handled"
            >
              {/* A log on this screen can offer to rebalance the week (free, WP-07) */}
              <RebalanceOffer />
              <RebalanceBanner />
              <DayFitNote />
              {/* Target change notice (§2.11, T-11.1/T-11.5) — never a silent change */}
              <ChangeNoticeCard />

              <NutritionCard
                testID="tracker-totals"
                eatenKcal={day.loggedKcal}
                targetKcal={dayTargets?.dailyCalorieTarget ?? 2000}
                protein={{ value: day.loggedProtein, target: dayTargets?.proteinG ?? 125 }}
                carbs={{ value: day.loggedCarbs, target: dayTargets?.carbsG ?? 225 }}
                fat={{ value: day.loggedFat, target: dayTargets?.fatG ?? 65 }}
                proteinOnly={proteinOnly}
                proteinGuide={data?.proteinGuide?.label}
                onPlan={{
                  eaten: states.filter((st) => st.status === 'eaten' || st.status === 'replaced')
                    .length,
                  planned: planned.length,
                }}
                header={
                  data?.trainingDay ? (
                    <TrainingDayNote t={data.trainingDay} isToday={isToday} className="mb-0" />
                  ) : null
                }
                action={
                  // UX-11 AC3: "Why this number".
                  <IconButton
                    testID="tracker-why-target"
                    accessibilityLabel={t('tracker.page.whyTarget')}
                    icon={<Icon name="info" color={colors.labelTertiary} size={20} />}
                    onPress={() => day.setExplainOpen(true)}
                  />
                }
              />

              {/* Planned meals to check off */}
              <View className="gap-3">
                <SectionTitle>{t('tracker.page.planned')}</SectionTitle>
                {(data?.plannedMeals ?? []).length === 0 ? (
                  <BoardCard testID="tracker-empty-plan" className="items-center py-6">
                    <Text
                      testID="tracker-empty-plan-text"
                      className="text-center text-callout text-label-secondary"
                    >
                      {data?.hasActivePlan === false
                        ? // T-19.6: a Track-only user may never generate a plan.
                          t('tracker.page.emptyNoPlan')
                        : t('tracker.page.emptyNoMealsPlain')}
                    </Text>
                  </BoardCard>
                ) : (
                  <View className="overflow-hidden rounded-card border border-separator bg-surface">
                    {planned.map((meal, i) => {
                      const state = states[i];
                      const isChecked = day.checked(meal.key);
                      const portion = day.portionOf(meal);
                      const slot = { mealType: meal.mealType, slotIndex: meal.slotIndex ?? i };
                      const divider = i > 0 ? 'border-t border-separator' : '';
                      const type = mealTypeLabel(meal.mealType);

                      // WP-06: swapped for something else — says what you had; Remove brings the plan back.
                      if (state?.status === 'replaced') {
                        const entry = state.entry;
                        const entryId = entry.entryId;
                        return (
                          <View
                            key={meal.key}
                            testID={`tracker-meal-${meal.mealType}`}
                            className={cn('gap-1 bg-surface-sunken px-4 py-3', divider)}
                          >
                            <Text className="text-subhead font-semibold text-brand">{type}</Text>
                            <StatusLine
                              testID={`tracker-slot-replaced-${meal.key}`}
                              text={youHadText(entry, proteinOnly, noNumbers)}
                              actionLabel={entryId ? SLOT_COPY.remove : undefined}
                              onAction={
                                entryId && entry.custom
                                  ? () =>
                                      slotFlow.actions.removeReplacement({
                                        entryId,
                                        name: entry.custom?.name ?? t('tracker.slot.somethingElse'),
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
                            <Text numberOfLines={1} className="text-caption text-label-tertiary">
                              {t('tracker.page.plannedName', { name: meal.recipeName })}
                            </Text>
                          </View>
                        );
                      }

                      // WP-06: skipped — neither eaten nor remaining; Undo puts it back.
                      if (state?.status === 'skipped') {
                        return (
                          <View
                            key={meal.key}
                            testID={`tracker-meal-${meal.mealType}`}
                            className={cn('gap-1 bg-surface-sunken px-4 py-3', divider)}
                          >
                            <Text className="text-subhead font-semibold text-label-secondary">
                              {type}
                            </Text>
                            <Text numberOfLines={1} className="text-callout text-label-secondary">
                              {meal.recipeName}
                            </Text>
                            <StatusLine
                              testID={`tracker-slot-skipped-${meal.key}`}
                              text={SLOT_COPY.skippedLabel}
                              actionLabel={SLOT_COPY.undo}
                              onAction={() => slotFlow.actions.unskipSlot(slot)}
                            />
                          </View>
                        );
                      }

                      return (
                        <View key={meal.key} className={cn('px-3 py-2', divider)}>
                          <View className="flex-row items-center">
                            {/* MO-01: the whole row ticks (busy hands, WP-04 C). */}
                            <PressableScale
                              testID={`tracker-meal-${meal.mealType}`}
                              pressScale="card"
                              accessibilityRole="checkbox"
                              accessibilityState={{ checked: isChecked }}
                              accessibilityLabel={t('tracker.page.mealName', {
                                meal: type,
                                name: meal.recipeName,
                              })}
                              onPress={() => {
                                haptics.selection();
                                day.toggleMeal(meal);
                              }}
                              className="min-h-12 min-w-0 flex-1 flex-row items-center gap-3"
                            >
                              <MediaFrame
                                imageUri={getRecipeImageUrl(meal.imageUrl)}
                                illustration={<Icon name="cook" color={colors.brand} size={24} />}
                                size={56}
                                square
                                radius="inner"
                              />
                              <View className="min-w-0 flex-1">
                                <Text className="text-subhead font-semibold text-brand">
                                  {type}
                                </Text>
                                <Text
                                  numberOfLines={2}
                                  className="text-callout font-semibold text-label"
                                >
                                  {meal.recipeName}
                                </Text>
                                <Text className="text-caption text-label-secondary">
                                  {metaLine(
                                    nutritionLabel(
                                      {
                                        kcal: meal.kcal * portion,
                                        protein: meal.protein * portion,
                                      },
                                      proteinOnly,
                                      noNumbers,
                                    ),
                                    // Lane E3 "Hide numbers": the portion stands in for the figures.
                                    noNumbers && portionLabel(portion),
                                    planPortionOf(meal) !== 1 &&
                                      t('tracker.page.planPortion', {
                                        portion: formatPortion(planPortionOf(meal)),
                                      }),
                                  )}
                                </Text>
                              </View>
                              {/* WP-06: only a meal still to eat can be swapped or skipped. */}
                            </PressableScale>
                            {!isChecked ? (
                              <IconButton
                                testID={`tracker-slot-actions-${meal.key}`}
                                accessibilityLabel={moreActionsLabel(meal.mealType)}
                                icon={<Icon name="more" color={colors.brand} size={22} />}
                                onPress={() =>
                                  slotFlow.openMenu({ ...slot, name: meal.recipeName })
                                }
                              />
                            ) : null}
                            <PressableScale
                              testID={`tracker-tick-${meal.mealType}`}
                              accessibilityRole="checkbox"
                              accessibilityState={{ checked: isChecked }}
                              accessibilityLabel={
                                isChecked
                                  ? t('tracker.page.eaten', { name: meal.recipeName })
                                  : t('tracker.page.markEaten', { name: meal.recipeName })
                              }
                              onPress={() => {
                                haptics.selection();
                                day.toggleMeal(meal);
                              }}
                            >
                              <Tick checked={isChecked} />
                            </PressableScale>
                          </View>

                          {isChecked ? (
                            <View className="mt-2 flex-row gap-1.5">
                              {portionOptionsFor(meal).map((p) => (
                                <PressableScale
                                  key={p}
                                  testID={`tracker-portion-${meal.key}-${p}`}
                                  accessibilityRole="button"
                                  accessibilityLabel={t('tracker.page.portionChip', {
                                    portion: formatPortion(p),
                                  })}
                                  accessibilityState={{ selected: portion === p }}
                                  onPress={() => day.setPortion(meal, p)}
                                  className={cn(
                                    'min-h-11 flex-1 items-center justify-center rounded-control',
                                    portion === p ? 'bg-brand' : 'bg-brand-tint',
                                  )}
                                >
                                  <Text
                                    className={cn(
                                      'text-subhead font-semibold',
                                      portion === p ? 'text-brand-on' : 'text-brand',
                                    )}
                                  >
                                    {formatPortion(p)}
                                  </Text>
                                </PressableScale>
                              ))}
                            </View>
                          ) : null}
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>

              {/* Also eaten — off-plan recipes and custom entries (scans + quick
                adds). Tap to edit, bin to delete with Undo (UX-FOOD-03, B-34). */}
              {alsoEatenRows.length > 0 ? (
                <View testID="tracker-also-eaten" className="gap-3">
                  <SectionTitle>{t('tracker.page.alsoEaten')}</SectionTitle>
                  <View className="overflow-hidden rounded-card border border-separator bg-surface">
                    {alsoEatenRows.map((item, i) => {
                      const divider = i > 0 ? 'border-t border-separator' : '';
                      if (item.kind === 'recipe') {
                        const m = item.m;
                        const portionText =
                          (m.portionMultiplier ?? 1) !== 1
                            ? ` · ${formatPortion(m.portionMultiplier ?? 1)}`
                            : '';
                        return (
                          <View
                            key={m.entryId ?? `${m.recipeId}:${m.mealType}`}
                            className={cn('flex-row items-center pl-4 pr-1', divider)}
                          >
                            <PressableScale
                              testID={`tracker-off-plan-${m.entryId ?? m.recipeId}`}
                              accessibilityRole="button"
                              accessibilityLabel={t('tracker.page.edit', { name: m.recipeName })}
                              disabled={!m.entryId}
                              onPress={() => day.setEditingRecipeEntryId(m.entryId ?? null)}
                              className="min-h-14 min-w-0 flex-1 justify-center py-2"
                            >
                              <Text
                                numberOfLines={1}
                                className="text-callout font-semibold text-label"
                              >
                                {m.recipeName}
                              </Text>
                              <Text className="text-caption text-label-secondary">
                                {metaLine(
                                  `${nutritionLabel(m, proteinOnly, noNumbers)}${portionText}`.replace(
                                    /^ · /,
                                    '',
                                  ),
                                  mealTypeLabel(m.mealType),
                                )}
                              </Text>
                            </PressableScale>
                            {m.entryId ? (
                              <IconButton
                                testID={`tracker-off-plan-delete-${m.entryId}`}
                                accessibilityLabel={t('tracker.page.delete', {
                                  name: m.recipeName,
                                })}
                                disabled={day.deleteEntriesMutation.isPending}
                                icon={<Icon name="trash" color={colors.brand} size={20} />}
                                onPress={() => day.deleteOffPlanEntry(m)}
                              />
                            ) : null}
                          </View>
                        );
                      }
                      const row = item.row;
                      return (
                        <View
                          key={row.entryIndex}
                          className={cn('flex-row items-center pl-4 pr-1', divider)}
                        >
                          <PressableScale
                            testID={`tracker-custom-${row.entryIndex}`}
                            accessibilityRole="button"
                            accessibilityLabel={t('tracker.page.edit', { name: row.name })}
                            onPress={() => day.setEditingEntry(row)}
                            className="min-h-14 min-w-0 flex-1 justify-center py-2"
                          >
                            <Text
                              numberOfLines={1}
                              className="text-callout font-semibold text-label"
                            >
                              {row.name}
                            </Text>
                            <Text className="text-caption text-label-secondary">
                              {metaLine(
                                nutritionLabel(row, proteinOnly, noNumbers),
                                mealTypeLabel(row.mealType),
                                customEntryChipLabel(row.estimatedBy),
                              )}
                            </Text>
                          </PressableScale>
                          <IconButton
                            testID={`tracker-custom-delete-${row.entryIndex}`}
                            accessibilityLabel={t('tracker.page.delete', { name: row.name })}
                            disabled={day.deleteCustomMutation.isPending}
                            icon={<Icon name="trash" color={colors.brand} size={20} />}
                            onPress={() => day.deleteCustomEntry(row)}
                          />
                        </View>
                      );
                    })}
                  </View>
                </View>
              ) : null}

              {/* Log something (T-19.1) — search-first sheet, any day. */}
              <ActionButton
                testID="tracker-quick-add"
                label={t('tracker.quickAdd.trigger')}
                icon="add"
                onPress={() => day.setQuickAddOpen(true)}
              />

              {/* Snap-to-Log (F4 / M3-2) — today only; past days are typed by hand */}
              {isToday ? (
                <ScanMealCard
                  date={dateStr}
                  onLogged={() => invalidateDayQueries(utils, dateStr)}
                  autoPick={snap === '1'}
                  onAutoPicked={() => router.setParams({ snap: undefined })}
                />
              ) : null}

              {/* Lane D2: a half-logged day can be left out of the weekly review. */}
              {!isFuture && data && (data.log?.loggedMeals.length ?? 0) > 0 ? (
                <PartlyLoggedRow date={dateStr} incomplete={data.incomplete ?? false} />
              ) : null}
            </ScrollView>
          )}

          <QuickAddSheet
            visible={day.quickAddOpen}
            onClose={() => day.setQuickAddOpen(false)}
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
            visible={day.editingEntry !== null}
            onClose={() => day.setEditingEntry(null)}
            date={dateStr}
            entry={day.editingEntry}
            onSaved={() => invalidateDayQueries(utils, dateStr)}
            onDeleted={() => day.setEditingEntry(null)}
          />

          <EditRecipeEntrySheet
            visible={day.editingRecipeEntry !== null}
            onClose={() => day.setEditingRecipeEntryId(null)}
            entry={day.editingRecipeEntry}
            onSave={(edit) => {
              if (!day.editingRecipeEntry?.entryId) return;
              day.updateRecipeEntryMutation.mutate({
                date: dateStr,
                entryId: day.editingRecipeEntry.entryId,
                ...edit,
              });
              day.setEditingRecipeEntryId(null);
            }}
            onDelete={() =>
              day.editingRecipeEntry && day.deleteOffPlanEntry(day.editingRecipeEntry)
            }
          />

          <TargetExplainSheet
            visible={day.explainOpen}
            onClose={() => day.setExplainOpen(false)}
            view={day.targetsView}
          />

          <MealActionsSheet
            visible={mealActionsOpen}
            onClose={() => setMealActionsOpen(false)}
            date={dateStr}
            loggedMealTypes={(data?.log?.loggedMeals ?? []).map((m) => m.mealType)}
          />
          <ConfirmSheet
            visible={day.copyDayOpen}
            onClose={() => day.setCopyDayOpen(false)}
            title={t('tracker.page.copyDayTitle')}
            body={
              isToday
                ? t('tracker.page.copyDayBodyToday', { from: day.copyLabel })
                : t('tracker.page.copyDayBodyThisDay', { from: day.copyLabel })
            }
            confirmLabel={
              day.copyDayMutation.isPending
                ? t('tracker.page.copying')
                : isToday
                  ? t('tracker.page.copyToToday', { from: day.copyLabel })
                  : t('tracker.page.copyToThisDay', { from: day.copyLabel })
            }
            cancelLabel={t('common.actions.cancel')}
            onConfirm={day.confirmCopyDay}
            busy={day.copyDayMutation.isPending}
            error={
              day.copyDayMutation.isError
                ? t('tracker.page.copyFailed', {
                    error: userFacingErrorMessage(day.copyDayMutation.error),
                  })
                : null
            }
            testID="tracker-copy-day-confirm"
          />
        </Screen>
      </ShellChromeProvider>
    </NumbersModeProvider>
  );
}
