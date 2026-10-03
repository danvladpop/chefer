import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, Card, EmptyState, ErrorState, Screen, Text, useSnackbar } from '@chefer/ui-mobile';
import {
  cn,
  defaultSavedWeekName,
  formatDate,
  formatKcal,
  sumPlanDay,
  userFacingErrorMessage,
} from '@chefer/utils';
import { useRestorePlan } from '../../src/features/history/use-restore-plan';
import { PlanMealCard } from '../../src/features/meal-plan/plan-meal-card';
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
  const snackbar = useSnackbar();

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
  const dayKcal = sumPlanDay(meals).kcal;

  return (
    <Screen edges={['top', 'bottom', 'left', 'right']} className="px-0">
      <View className="flex-row items-center gap-3 px-4 py-3">
        <Pressable
          testID="history-plan-back"
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          className="h-11 w-11 items-center justify-center"
        >
          <Ionicons name="arrow-back" size={20} color="#1f2937" />
        </Pressable>
        <View className="min-w-0 flex-1">
          <Text className="text-xs font-semibold uppercase tracking-widest text-gray-500">
            Read-only view
          </Text>
          <Text testID="history-plan-title" variant="title" numberOfLines={1}>
            {weekStart ? `Week of ${formatDate(weekStart, 'medium')}` : 'Past week'}
          </Text>
        </View>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#944a00" />
        </View>
      ) : !plan ? (
        // Not found is a real answer; anything else is a failed load
        // (audit F-X-3-1) and gets a retry.
        isError && error.data?.code !== 'NOT_FOUND' ? (
          <ErrorState
            testID="history-plan-error"
            title="Couldn't load this week"
            icon={<Ionicons name="cloud-offline-outline" size={40} color="#9ca3af" />}
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
                    'h-14 w-11 items-center justify-center gap-0.5 rounded-xl',
                    isSelected ? 'bg-primary' : 'bg-gray-50',
                  )}
                >
                  <Text
                    className={cn(
                      'text-xs font-semibold uppercase',
                      isSelected ? 'text-primary-foreground' : 'text-gray-600',
                    )}
                  >
                    {label}
                  </Text>
                  <Text
                    className={cn(
                      'text-xs font-bold',
                      isSelected ? 'text-primary-foreground' : 'text-gray-800',
                    )}
                  >
                    {date.getDate()}
                  </Text>
                  <View
                    className={cn(
                      'h-1 w-1 rounded-full',
                      !hasMeals ? 'bg-transparent' : isSelected ? 'bg-white/70' : 'bg-primary',
                    )}
                  />
                </Pressable>
              );
            })}
          </View>

          <ScrollView contentContainerClassName="gap-3 px-4 py-2 pb-8">
            {meals.length === 0 ? (
              <Card className="items-center py-8">
                <Text variant="muted">No meals planned for this day.</Text>
              </Card>
            ) : (
              <>
                <Text testID="history-day-kcal" className="text-xs text-gray-500">
                  Day total · {formatKcal(dayKcal)} kcal
                </Text>
                {day?.proteinGapG !== undefined && (
                  <Text testID="history-day-protein-gap" className="text-xs text-amber-800">
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

          <View className="gap-2 border-t border-border px-4 pb-2 pt-3">
            {restore.errorFor(plan.planId) && (
              <Text testID="history-plan-restore-error" className="text-xs text-red-600">
                {restore.errorFor(plan.planId)}
              </Text>
            )}
            <Button
              testID="history-plan-restore"
              variant="outline"
              loading={restore.pendingPlanId === plan.planId}
              onPress={() => restore.requestRestore(plan.planId, weekLabel ?? '')}
            >
              Use this week again
            </Button>
            <Button
              testID="history-plan-save-week"
              variant="ghost"
              loading={saveAsWeek.isPending}
              onPress={() =>
                weekStart &&
                saveAsWeek.mutate({ planId: plan.planId, name: defaultSavedWeekName(weekStart) })
              }
            >
              Save as a week
            </Button>
          </View>
          {restore.sheet}
        </>
      )}
    </Screen>
  );
}
