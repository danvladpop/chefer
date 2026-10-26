import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import {
  EmptyState,
  ErrorState,
  IconButton,
  Screen,
  Text,
  useSnackbar,
  useThemeColors,
} from '@chefer/ui-mobile';
import {
  cn,
  defaultSavedWeekName,
  formatDate,
  formatKcal,
  sumPlanDay,
  userFacingErrorMessage,
} from '@chefer/utils';
import { Icon } from '../../src/components/icon';
import { useRestorePlan } from '../../src/features/history/use-restore-plan';
import { PlanMealCard } from '../../src/features/meal-plan/plan-meal-card';
import { useNumbersMode } from '../../src/features/numbers-mode/numbers-mode';
import { BoardCard } from '../../src/features/shell/today/parts';
import { TrainButton } from '../../src/features/shell/train/train-button';
import { trpc } from '../../src/lib/trpc';

// Past-week detail — port of apps/web (dashboard)/history/[planId]
// (audit F-M-PAR-1). Read-only, one day at a time like web's phone layout;
// tapping a meal opens the recipe. UX-PLAN-11: meals the user logged are
// marked "Eaten" (the view shows what happened, not only the plan), and this
// is where you decide a week is worth bringing back — "Use this week again"
// (into this or next week) or "Save as a week" (a My weeks template).

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MEAL_ORDER = ['breakfast', 'lunch', 'dinner', 'snack'];

export default function HistoryPlanScreen() {
  const { planId } = useLocalSearchParams<{ planId: string; status?: string }>();
  const [selectedDay, setSelectedDay] = useState(0);
  // WP-08: protein-only mode shows protein, never kcal, for a past week too;
  // lane E3 "Hide numbers" shows neither.
  const { proteinOnly, noNumbers } = useNumbersMode();
  const snackbar = useSnackbar();
  const colors = useThemeColors();

  const {
    data: plan,
    isLoading,
    isError,
    error,
    refetch,
  } = trpc.mealPlan.getById.useQuery({ planId }, { staleTime: 60_000, retry: false });

  // Back to My weeks once the copy lands (it is now that week's plan).
  const restore = useRestorePlan({ onRestored: () => router.back() });

  // UX-PLAN-11: keep this week as one of the (max 4) saved weeks.
  const saveAsWeek = trpc.mealPlan.saveAsTemplate.useMutation({
    meta: { silent: true },
    onSuccess: (saved) =>
      snackbar.show({ message: `Saved as “${saved.name}” in My weeks.`, tone: 'success' }),
    onError: (err) => snackbar.show({ message: userFacingErrorMessage(err) }),
  });

  const weekStart = plan ? new Date(plan.weekStartDate) : null;
  const weekLabel = weekStart ? formatDate(weekStart, 'short') : undefined;
  const day = plan?.days.find((d) => d.dayOfWeek === selectedDay);
  const meals = [...(day?.meals ?? [])].sort(
    (a, b) => MEAL_ORDER.indexOf(a.type) - MEAL_ORDER.indexOf(b.type),
  );
  // Each slot at its portion (P1-1) — the same sum as the Plan tab and web.
  const dayTotals = sumPlanDay(meals);
  const dayKcal = dayTotals.kcal;

  return (
    <Screen edges={['top', 'bottom', 'left', 'right']} className="bg-canvas px-0">
      {/* The shell's pushed-page top bar (chevron Back + title1), drawn here
          to keep the history-plan-back / history-plan-title ids. */}
      <View className="min-h-11 flex-row items-center gap-1 px-4 py-2">
        <IconButton
          testID="history-plan-back"
          accessibilityLabel="Back"
          icon={<Icon name="chevronBack" color={colors.brand} size={26} />}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/my-weeks'))}
          className="-ml-2"
        />
        <View className="min-w-0 flex-1">
          <Text className="text-subhead font-semibold text-label-secondary" numberOfLines={1}>
            Read-only view
          </Text>
          <Text
            testID="history-plan-title"
            accessibilityRole="header"
            className="text-title1 font-bold text-label"
            numberOfLines={1}
          >
            {weekStart ? `Week of ${formatDate(weekStart, 'medium')}` : 'Past week'}
          </Text>
        </View>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.brand} />
        </View>
      ) : !plan ? (
        // Not found is a real answer; anything else is a failed load
        // (audit F-X-3-1) and gets a retry.
        isError && error.data?.code !== 'NOT_FOUND' ? (
          <ErrorState
            testID="history-plan-error"
            title="Couldn't load this week"
            icon={<Ionicons name="cloud-offline-outline" size={40} color={colors.labelTertiary} />}
            onRetry={() => void refetch()}
          />
        ) : (
          <EmptyState
            testID="history-plan-not-found"
            title="Plan not found"
            description="It may have been removed. Your other weeks are still in My weeks."
            action={{ label: 'Back to My weeks', onPress: () => router.back() }}
          />
        )
      ) : (
        <>
          {/* Day chips */}
          <View className="flex-row justify-between px-4 pb-2">
            {DAY_LABELS.map((label, i) => {
              const isSelected = selectedDay === i;
              const hasMeals = plan.days.some((d) => d.dayOfWeek === i && d.meals.length > 0);
              const date = new Date(plan.weekStartDate);
              date.setDate(date.getDate() + i);
              return (
                <Pressable
                  key={label}
                  testID={`history-day-${i}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={formatDate(date, 'weekday-long-date')}
                  onPress={() => setSelectedDay(i)}
                  className={cn(
                    'h-14 w-11 items-center justify-center gap-0.5 rounded-control border',
                    isSelected ? 'border-brand bg-brand' : 'border-separator bg-surface',
                  )}
                >
                  <Text
                    className={cn(
                      'text-caption font-semibold',
                      isSelected ? 'text-brand-on' : 'text-label-secondary',
                    )}
                  >
                    {label}
                  </Text>
                  <Text
                    className={cn(
                      'text-caption font-bold',
                      isSelected ? 'text-brand-on' : 'text-label',
                    )}
                  >
                    {date.getDate()}
                  </Text>
                  <View
                    className={cn(
                      'h-1 w-1 rounded-full',
                      !hasMeals ? 'bg-transparent' : isSelected ? 'bg-brand-on' : 'bg-brand',
                    )}
                  />
                </Pressable>
              );
            })}
          </View>

          <ScrollView contentContainerClassName="gap-3 px-4 py-2 pb-8">
            {meals.length === 0 ? (
              <BoardCard className="items-center py-8">
                <Text className="text-body text-label-secondary">
                  No meals planned for this day.
                </Text>
              </BoardCard>
            ) : (
              <>
                {noNumbers ? null : (
                  <Text testID="history-day-kcal" className="text-subhead text-label-secondary">
                    {proteinOnly
                      ? `Day total · ${dayTotals.protein} g protein`
                      : `Day total · ${formatKcal(dayKcal)} kcal`}
                  </Text>
                )}
                {/* Lane E3: a shortfall is stated in neutral text, never an alarm colour. */}
                {!noNumbers && day?.proteinGapG !== undefined && (
                  <Text
                    testID="history-day-protein-gap"
                    className="text-subhead text-label-secondary"
                  >
                    Protein short by {day.proteinGapG} g
                  </Text>
                )}
                {meals.map((meal, i) => (
                  <PlanMealCard
                    key={`${meal.type}-${i}`}
                    testID={`history-meal-${meal.type}`}
                    meal={meal}
                    eaten={day?.loggedRecipeIds?.includes(meal.recipe.id) === true}
                  />
                ))}
              </>
            )}
          </ScrollView>

          <View className="gap-2 border-t border-separator bg-canvas px-4 pb-2 pt-3">
            {restore.errorFor(plan.planId) && (
              <Text testID="history-plan-restore-error" className="text-caption text-danger">
                {restore.errorFor(plan.planId)}
              </Text>
            )}
            <TrainButton
              testID="history-plan-restore"
              label="Use this week again"
              loading={restore.pendingPlanId === plan.planId}
              onPress={() => restore.requestRestore(plan.planId, weekLabel ?? '')}
            />
            <TrainButton
              testID="history-plan-save-week"
              label="Save as a week"
              variant="ghost"
              loading={saveAsWeek.isPending}
              onPress={() => {
                if (weekStart) {
                  saveAsWeek.mutate({ planId: plan.planId, name: defaultSavedWeekName(weekStart) });
                }
              }}
            />
          </View>
          {restore.sheet}
        </>
      )}
    </Screen>
  );
}
