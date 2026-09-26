import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, Card, EmptyState, ErrorState, Screen, Text } from '@chefer/ui-mobile';
import { cn } from '@chefer/utils';
import { useRestorePlan } from '../../src/features/history/use-restore-plan';
import { PlanMealCard } from '../../src/features/meal-plan/plan-meal-card';
import { trpc } from '../../src/lib/trpc';

// History plan detail — port of apps/web (dashboard)/history/[planId]
// (audit F-M-PAR-1). Read-only, one day at a time like web's phone layout;
// tapping a meal opens the recipe. Addition over web: Restore (behind the same
// confirm as the list), since this is where you decide a week is worth
// bringing back. The list passes `status` so an ACTIVE week hides Restore —
// getById doesn't carry it.

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MEAL_ORDER = ['breakfast', 'lunch', 'dinner', 'snack'];

export default function HistoryPlanScreen() {
  const { planId, status } = useLocalSearchParams<{ planId: string; status?: string }>();
  const [selectedDay, setSelectedDay] = useState(0);

  const {
    data: plan,
    isLoading,
    isError,
    error,
    refetch,
  } = trpc.mealPlan.getById.useQuery({ planId }, { staleTime: 60_000, retry: false });

  // Back to the list, which now shows the restored copy as ACTIVE.
  const restore = useRestorePlan({ onRestored: () => router.back() });

  const weekStart = plan ? new Date(plan.weekStartDate) : null;
  const weekLabel = weekStart?.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const day = plan?.days.find((d) => d.dayOfWeek === selectedDay);
  const meals = [...(day?.meals ?? [])].sort(
    (a, b) => MEAL_ORDER.indexOf(a.type) - MEAL_ORDER.indexOf(b.type),
  );
  const dayKcal = meals.reduce((sum, m) => sum + m.recipe.nutritionInfo.calories, 0);
  const canRestore = plan != null && status !== 'ACTIVE';

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
            {weekStart
              ? `Week of ${weekStart.toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}`
              : 'Past week'}
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
            description="It may have been removed. Your other weeks are still in History."
            action={{ label: 'Back to History', onPress: () => router.back() }}
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
                  accessibilityLabel={date.toLocaleDateString('en-GB', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                  })}
                  onPress={() => setSelectedDay(i)}
                  className={cn(
                    'h-14 w-11 items-center justify-center gap-0.5 rounded-xl',
                    isSelected ? 'bg-primary' : 'bg-gray-50',
                  )}
                >
                  <Text
                    className={cn(
                      'text-[12px] font-semibold uppercase',
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
                  Day total · {dayKcal.toLocaleString('en-GB')} kcal
                </Text>
                {meals.map((meal) => (
                  <PlanMealCard
                    key={`${meal.type}-${meal.recipe.id}`}
                    testID={`history-meal-${meal.type}`}
                    meal={meal}
                  />
                ))}
              </>
            )}
          </ScrollView>

          {canRestore && (
            <View className="gap-1 border-t border-border px-4 pb-2 pt-3">
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
                Restore this week
              </Button>
            </View>
          )}
          {restore.sheet}
        </>
      )}
    </Screen>
  );
}
