import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Button, Card, ErrorState, Screen, Text } from '@chefer/ui-mobile';
import {
  cn,
  customEntryChipLabel,
  customEntryRows,
  customEntryTotals,
  formatPortion,
  localDateStr,
  slotPortion,
} from '@chefer/utils';
import { MealTypeBadge } from '../src/features/dashboard/components/meal-type-badge';
import { TrainingDayNote } from '../src/features/dashboard/components/training-day-note';
import { QuickAddSheet } from '../src/features/tracker/quick-add-sheet';
import { RebalanceBanner } from '../src/features/tracker/rebalance-banner';
import { recordRebalance } from '../src/features/tracker/rebalance-store';
import { ScanMealCard } from '../src/features/tracker/scan-meal-card';
import { getRecipeImageUrl } from '../src/lib/recipe-image';
import { trpc } from '../src/lib/trpc';

// Tracker — port of apps/web (dashboard)/tracker/page.tsx (M2-4), with quick
// add, Snap-to-Log (M3-2) and the week-rebalance banner (P1-7). Deviation,
// deliberate: the rebalance banner + undo shows HERE, right after the log
// that caused it — web only shows it on the meal plan (F-TRK-3-2).

type PortionKey = number;
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

  const [checkedMeals, setCheckedMeals] = useState<
    Record<string, { checked: boolean; portion: PortionKey }>
  >({});
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [initialised, setInitialised] = useState<string | null>(null);

  const getKey = (recipeId: string, mealType: string) => `${recipeId}:${mealType}`;

  // Pre-populate from the existing log, once per date (same rules as web:
  // custom entries have no recipeId and are preserved verbatim on save).
  useEffect(() => {
    if (!data || initialised === dateStr) {
      return;
    }
    if (data.log) {
      const init: Record<string, { checked: boolean; portion: PortionKey }> = {};
      for (const m of data.log.loggedMeals) {
        if (!m.recipeId) {
          continue;
        }
        init[getKey(m.recipeId, m.mealType)] = {
          checked: true,
          portion: m.portionMultiplier,
        };
      }
      setCheckedMeals(init);
    } else {
      setCheckedMeals({});
    }
    setInitialised(dateStr);
  }, [data, dateStr, initialised]);

  const upsertMutation = trpc.tracker.upsertDay.useMutation({
    onSuccess: (result) => {
      recordRebalance(result.rebalance);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
      void refetch();
    },
  });
  const deleteCustomMutation = trpc.tracker.deleteCustomMeal.useMutation({
    onSuccess: () => void refetch(),
  });

  const toggleMeal = (recipeId: string, mealType: string, planPortion: PortionKey) => {
    const k = getKey(recipeId, mealType);
    setCheckedMeals((prev) => ({
      ...prev,
      [k]: { checked: !(prev[k]?.checked ?? false), portion: prev[k]?.portion ?? planPortion },
    }));
    setSavedSuccess(false);
  };

  const setPortion = (recipeId: string, mealType: string, portion: PortionKey) => {
    const k = getKey(recipeId, mealType);
    setCheckedMeals((prev) => ({ ...prev, [k]: { checked: true, portion } }));
    setSavedSuccess(false);
  };

  const changeDate = (delta: number) => {
    setSelectedDate((d) => addDays(d, delta));
    setCheckedMeals({});
    setSavedSuccess(false);
    setInitialised(null);
  };

  // Custom and off-plan entries are server-owned: upsertDay merges, so a save
  // sends only the planned meals this screen manages (F-PM-1, F-TRK-1-2).
  const offPlanLogged = data?.offPlanLogged ?? [];
  const offPlanTotals = offPlanLogged.reduce(
    (t, m) => ({
      kcal: t.kcal + m.kcal,
      protein: t.protein + m.protein,
      carbs: t.carbs + m.carbs,
      fat: t.fat + m.fat,
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );
  // A day with planned meals already logged can be saved with nothing ticked
  // — that un-logs them (F-TRK-1-3).
  const plannedIds = new Set((data?.plannedMeals ?? []).map((m) => m.recipeId));
  const hadPlannedLogged = (data?.log?.loggedMeals ?? []).some(
    (m) => m.recipeId !== undefined && plannedIds.has(m.recipeId),
  );
  const customRows = customEntryRows(data?.log?.loggedMeals ?? []);
  const customTotals = customEntryTotals(data?.log?.loggedMeals ?? []);

  const checked = (recipeId: string, mealType: string) =>
    checkedMeals[getKey(recipeId, mealType)]?.checked ?? false;
  const portionOf = (m: { recipeId: string; mealType: string; portion?: number }): PortionKey =>
    checkedMeals[getKey(m.recipeId, m.mealType)]?.portion ?? planPortionOf(m);

  const loggedPlanned = (data?.plannedMeals ?? []).filter((m) => checked(m.recipeId, m.mealType));
  const loggedKcal =
    loggedPlanned.reduce((s, m) => s + Math.round(m.kcal * portionOf(m)), 0) +
    customTotals.kcal +
    offPlanTotals.kcal;
  const loggedProtein =
    loggedPlanned.reduce((s, m) => s + m.protein * portionOf(m), 0) +
    customTotals.protein +
    offPlanTotals.protein;
  const loggedCarbs =
    loggedPlanned.reduce((s, m) => s + m.carbs * portionOf(m), 0) +
    customTotals.carbs +
    offPlanTotals.carbs;
  const loggedFat =
    loggedPlanned.reduce((s, m) => s + m.fat * portionOf(m), 0) +
    customTotals.fat +
    offPlanTotals.fat;

  const handleSave = () => {
    if (!data) {
      return;
    }
    const plannedLogged = loggedPlanned.map((m) => {
      const portion = portionOf(m);
      return {
        recipeId: m.recipeId,
        mealType: m.mealType,
        portionMultiplier: portion,
        kcal: Math.round(m.kcal * portion),
        protein: Math.round(m.protein * portion * 10) / 10,
        carbs: Math.round(m.carbs * portion * 10) / 10,
        fat: Math.round(m.fat * portion * 10) / 10,
      };
    });
    if (plannedLogged.length === 0 && !hadPlannedLogged) {
      return;
    }
    upsertMutation.mutate({ date: dateStr, loggedMeals: plannedLogged });
  };

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
        <Text testID="tracker-title" variant="title">
          Tracker
        </Text>
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
        <ScrollView contentContainerClassName="gap-4 px-4 py-2 pb-8">
          {/* Premium week rebalance triggered by a log on this screen */}
          <RebalanceBanner />

          {/* Totals vs targets */}
          <Card testID="tracker-totals">
            <Text className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-500">
              Logged {isToday ? 'Today' : 'This Day'}
            </Text>
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
          </Card>

          {/* Planned meals to check off */}
          {(data?.plannedMeals ?? []).length === 0 ? (
            <Card className="items-center py-8">
              <Text variant="muted">No planned meals for this day.</Text>
            </Card>
          ) : (
            <View className="gap-2">
              {(data?.plannedMeals ?? []).map((meal) => {
                const isChecked = checked(meal.recipeId, meal.mealType);
                const portion = portionOf(meal);
                return (
                  <View
                    key={getKey(meal.recipeId, meal.mealType)}
                    className={cn(
                      'rounded-xl border p-2',
                      isChecked ? 'border-primary/30 bg-accent' : 'border-border bg-card',
                    )}
                  >
                    <Pressable
                      testID={`tracker-meal-${meal.mealType}`}
                      accessibilityRole="button"
                      accessibilityState={{ checked: isChecked }}
                      onPress={() => toggleMeal(meal.recipeId, meal.mealType, planPortionOf(meal))}
                      className="flex-row items-center gap-3"
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
                      <View
                        className={cn(
                          'h-6 w-6 items-center justify-center rounded-full border-2',
                          isChecked ? 'border-primary bg-primary' : 'border-gray-300',
                        )}
                      >
                        {isChecked && <Ionicons name="checkmark" size={14} color="white" />}
                      </View>
                    </Pressable>

                    {isChecked && (
                      <View className="mt-2 flex-row gap-1.5">
                        {portionOptionsFor(meal).map((p) => (
                          <Pressable
                            key={p}
                            accessibilityRole="button"
                            onPress={() => setPortion(meal.recipeId, meal.mealType, p)}
                            className={cn(
                              'h-9 flex-1 items-center justify-center rounded-lg border',
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

          {/* Quick add (F4, all tiers) — any day, for off-plan food */}
          <Button
            testID="tracker-quick-add"
            variant="outline"
            onPress={() => setQuickAddOpen(true)}
          >
            <View className="flex-row items-center gap-1.5">
              <Ionicons name="add" size={18} color="#944a00" />
              <Text className="text-sm font-medium text-primary">Quick add</Text>
            </View>
          </Button>

          {/* Snap-to-Log (F4 / M3-2) — today only; past days are typed by hand */}
          {isToday && <ScanMealCard date={dateStr} onLogged={() => void refetch()} />}

          {/* Off-plan meals (F-PM-1): logged recipes that have since left
              today's plan (regenerate or swap). Kept and counted. */}
          {offPlanLogged.length > 0 && (
            <View testID="tracker-off-plan" className="gap-2">
              <Text className="text-xs font-semibold uppercase tracking-widest text-gray-500">
                Also logged today
              </Text>
              {offPlanLogged.map((m) => (
                <View
                  key={`${m.recipeId}:${m.mealType}`}
                  className="rounded-xl border border-border bg-card p-3"
                >
                  <Text numberOfLines={1} className="text-sm font-medium text-gray-800">
                    {m.recipeName}
                  </Text>
                  <Text className="text-xs text-gray-500">
                    {m.mealType} · {Math.round(m.kcal)} kcal
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Custom entries (scans + quick adds) */}
          {customRows.length > 0 && (
            <View className="gap-2">
              <Text className="text-xs font-semibold uppercase tracking-widest text-gray-500">
                Extras
              </Text>
              {customRows.map((row) => (
                <View
                  key={row.entryIndex}
                  className="flex-row items-center gap-3 rounded-xl border border-border bg-card p-3"
                >
                  <View className="min-w-0 flex-1">
                    <View className="flex-row items-center gap-2">
                      <Text numberOfLines={1} className="shrink text-sm font-medium text-gray-800">
                        {row.name}
                      </Text>
                      <View className="rounded-full bg-gray-100 px-2 py-0.5">
                        <Text className="text-[12px] text-gray-500">
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
                    onPress={() =>
                      deleteCustomMutation.mutate({ date: dateStr, entryIndex: row.entryIndex })
                    }
                    className="h-11 w-11 items-center justify-center"
                  >
                    <Ionicons name="trash-outline" size={18} color="#9ca3af" />
                  </Pressable>
                </View>
              ))}
            </View>
          )}

          {/* Save */}
          <Button testID="tracker-save" loading={upsertMutation.isPending} onPress={handleSave}>
            {savedSuccess ? 'Saved ✓' : 'Save Day'}
          </Button>
        </ScrollView>
      )}

      <QuickAddSheet
        visible={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        date={dateStr}
        onLogged={() => void refetch()}
      />
    </Screen>
  );
}
