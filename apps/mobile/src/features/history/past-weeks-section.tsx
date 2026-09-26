import { ActivityIndicator, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Button, Card, ErrorState, Text } from '@chefer/ui-mobile';
import { cn, pastWeeks } from '@chefer/utils';
import { trpc } from '../../lib/trpc';
import { useRestorePlan } from './use-restore-plan';

// Past weeks on My weeks (P2-8) — History folded into My weeks, as on web.
// History listed future weeks and every regenerate as near-identical cards
// (F-PLAN-6-3); pastWeeks (@chefer/utils) keeps past weeks only, one card per
// week, newest first. The procedure's maximum page covers most of a year
// once deduped, so there is no pagination.

const HISTORY_LIMIT = 50;

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  ACTIVE: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  ARCHIVED: { bg: 'bg-gray-100', text: 'text-gray-500' },
};

export function PastWeeksSection() {
  const {
    data: plans = [],
    isLoading,
    isError,
    refetch,
  } = trpc.mealPlan.list.useQuery({ limit: HISTORY_LIMIT, offset: 0 }, { staleTime: 30_000 });
  const restore = useRestorePlan();
  const weeks = pastWeeks(plans);

  return (
    <View testID="past-weeks" className="gap-3">
      <Text className="mt-2 text-xs font-semibold uppercase tracking-widest text-gray-500">
        Past weeks
      </Text>

      {isLoading ? (
        <View className="items-center py-6">
          <ActivityIndicator color="#944a00" />
        </View>
      ) : isError && plans.length === 0 ? (
        <ErrorState
          title="Couldn't load your past weeks"
          icon={<Ionicons name="cloud-offline-outline" size={40} color="#9ca3af" />}
          onRetry={() => void refetch()}
        />
      ) : weeks.length === 0 ? (
        <Card testID="past-weeks-empty" className="items-center border-dashed py-8">
          <Ionicons name="time-outline" size={32} color="#d1d5db" />
          <Text variant="muted" className="mt-2 px-4 text-center text-sm">
            Once a planned week is over it shows up here, ready to cook again.
          </Text>
        </Card>
      ) : (
        weeks.map((plan) => {
          const weekStart = new Date(plan.weekStartDate);
          const weekEnd = new Date(plan.weekEndDate);
          const status = STATUS_STYLES[plan.status] ?? STATUS_STYLES.ARCHIVED;
          const opts = { month: 'short', day: 'numeric' } as const;
          const weekLabel = weekStart.toLocaleDateString('en-GB', opts);
          return (
            <Card key={plan.id} testID={`past-week-${plan.id}`} className="gap-2">
              <View className="flex-row items-center justify-between gap-2">
                <Text className="min-w-0 flex-1 text-sm font-semibold text-gray-900">
                  {weekLabel} – {weekEnd.toLocaleDateString('en-GB', opts)}
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

              {restore.errorFor(plan.id) && (
                <Text className="text-xs text-red-600">{restore.errorFor(plan.id)}</Text>
              )}
              <View className="flex-row gap-2">
                <Button
                  testID={`past-week-view-${plan.id}`}
                  variant="outline"
                  className="flex-1"
                  onPress={() =>
                    router.push({
                      pathname: '/history/[planId]',
                      params: { planId: plan.id, status: plan.status },
                    })
                  }
                >
                  View week
                </Button>
                {plan.status !== 'ACTIVE' && (
                  <Button
                    testID={`past-week-restore-${plan.id}`}
                    variant="outline"
                    className="flex-1"
                    loading={restore.pendingPlanId === plan.id}
                    disabled={restore.pendingPlanId !== null}
                    onPress={() => restore.requestRestore(plan.id, weekLabel)}
                  >
                    Restore
                  </Button>
                )}
              </View>
            </Card>
          );
        })
      )}
      {restore.sheet}
    </View>
  );
}
