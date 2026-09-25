import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Button, Card, Screen, Text } from '@chefer/ui-mobile';
import { cn } from '@chefer/utils';
import { trpc } from '../src/lib/trpc';

// Plan history — port of apps/web /history (M2-10). Deviation: the per-plan
// detail page (/history/[planId]) is not ported yet — restore covers the
// main job; detail arrives with a later sweep.

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  ACTIVE: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  ARCHIVED: { bg: 'bg-gray-100', text: 'text-gray-500' },
};

export default function HistoryScreen() {
  const limit = 10;
  const {
    data: plans = [],
    isLoading,
    refetch,
  } = trpc.mealPlan.list.useQuery({ limit, offset: 0 }, { staleTime: 30_000 });

  const restoreMutation = trpc.mealPlan.restore.useMutation({
    onSuccess: () => void refetch(),
  });

  return (
    <Screen edges={['top', 'bottom', 'left', 'right']} className="px-0">
      <View className="flex-row items-center gap-3 px-4 py-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          className="h-11 w-11 items-center justify-center"
        >
          <Ionicons name="arrow-back" size={20} color="#1f2937" />
        </Pressable>
        <View>
          <Text className="text-xs font-semibold uppercase tracking-widest text-gray-500">
            Past Plans
          </Text>
          <Text testID="history-title" variant="title">
            History
          </Text>
        </View>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#944a00" />
        </View>
      ) : plans.length === 0 ? (
        <Card className="mx-4 items-center border-dashed py-12">
          <Ionicons name="time-outline" size={40} color="#d1d5db" />
          <Text className="mb-1 mt-3 font-semibold text-gray-700">No past plans yet</Text>
          <Text variant="muted" className="px-6 text-center text-sm">
            Generate your first meal plan to start building your history.
          </Text>
        </Card>
      ) : (
        <ScrollView contentContainerClassName="gap-3 px-4 pb-8">
          {plans.map((plan) => {
            const weekStart = new Date(plan.weekStartDate);
            const weekEnd = new Date(plan.weekEndDate);
            const status = STATUS_STYLES[plan.status] ?? STATUS_STYLES.ARCHIVED;
            const opts = { month: 'short', day: 'numeric' } as const;
            return (
              <Card key={plan.id} testID={`history-plan-${plan.id}`} className="gap-2">
                <View className="flex-row items-center justify-between">
                  <Text className="text-sm font-semibold text-gray-900">
                    {weekStart.toLocaleDateString('en-GB', opts)} –{' '}
                    {weekEnd.toLocaleDateString('en-GB', opts)}
                  </Text>
                  <View className={cn('rounded-full px-2 py-0.5', status?.bg)}>
                    <Text className={cn('text-xs font-medium', status?.text)}>{plan.status}</Text>
                  </View>
                </View>

                {plan.recipePreview.length > 0 && (
                  <Text numberOfLines={2} variant="muted" className="text-xs">
                    {plan.recipePreview.join(' · ')}
                  </Text>
                )}

                <Text className="text-xs text-gray-500">
                  {plan.macroSummary.avgKcal} kcal avg · {plan.macroSummary.avgProtein}g P ·{' '}
                  {plan.macroSummary.avgCarbs}g C · {plan.macroSummary.avgFat}g F
                </Text>

                {plan.status !== 'ACTIVE' && (
                  <Button
                    variant="outline"
                    loading={restoreMutation.isPending}
                    onPress={() => restoreMutation.mutate({ planId: plan.id })}
                  >
                    Restore this week
                  </Button>
                )}
              </Card>
            );
          })}
        </ScrollView>
      )}
    </Screen>
  );
}
