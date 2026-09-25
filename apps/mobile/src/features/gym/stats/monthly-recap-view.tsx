import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { GymBootstrap } from '@chefer/types';
import { Button, Card, CardTitle, EmptyState, Text } from '@chefer/ui-mobile';
import { formatLoad, VOLUME_GROUP_LABELS } from '@chefer/utils';
import { trpc } from '../../../lib/trpc';
import { useIsOnline } from '../library-screens/online-status';
import { localDate } from '../offline/ids';
import { LogWeightPrompt } from './log-weight-prompt';

// (e) Monthly recap (gym_plan.md §1.3 Stats #5): sessions vs goal, weeks met,
// PR count, the 3 biggest e1RM gains, sets per group vs last month, and the
// bodyweight trend. Server-aggregated (needs a connection).

function currentMonth(): string {
  return localDate().slice(0, 7);
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y ?? 2026, (m ?? 1) - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function MonthlyRecapView({ bootstrap }: { bootstrap: GymBootstrap }) {
  const online = useIsOnline();
  const [month, setMonth] = useState(currentMonth);
  const recap = trpc.gym.stats.monthlyRecap.useQuery({ month }, { enabled: online });
  const byId = useMemo(() => new Map(bootstrap.library.map((e) => [e.id, e])), [bootstrap.library]);
  const unit = bootstrap.profile?.unit ?? 'KG';

  return (
    <Card testID="stats-monthly-recap">
      <View className="mb-3 flex-row items-center justify-between">
        <CardTitle className="mb-0">Monthly recap</CardTitle>
        <View className="flex-row items-center gap-1">
          <Button
            testID="stats-recap-prev"
            size="icon"
            variant="ghost"
            accessibilityLabel="Previous month"
            onPress={() => setMonth((m) => shiftMonth(m, -1))}
          >
            <Ionicons name="chevron-back" size={18} color="#374151" />
          </Button>
          <Text variant="muted">{month}</Text>
          <Button
            testID="stats-recap-next"
            size="icon"
            variant="ghost"
            accessibilityLabel="Next month"
            disabled={month >= currentMonth()}
            onPress={() => setMonth((m) => shiftMonth(m, 1))}
          >
            <Ionicons name="chevron-forward" size={18} color="#374151" />
          </Button>
        </View>
      </View>

      {!online && !recap.data ? (
        <EmptyState
          testID="stats-monthly-recap-offline"
          title="Connect to see this month's recap"
          description="The recap is put together from your full history on the server."
        />
      ) : recap.isLoading ? (
        <Text variant="muted">Loading…</Text>
      ) : !recap.data ? (
        <EmptyState testID="stats-monthly-recap-empty" title="No data for this month yet" />
      ) : (
        <View className="gap-2">
          <Text>
            Sessions: <Text className="font-semibold">{recap.data.sessions}</Text> /{' '}
            {recap.data.sessionsGoal} goal
          </Text>
          <Text>
            Weeks met: {recap.data.weeksMet} / {recap.data.weeksTotal}
          </Text>
          <Text>Streak: {recap.data.streak}</Text>
          <Text>PRs this month: {recap.data.prCount}</Text>

          {recap.data.topGains.length > 0 ? (
            <View className="mt-2">
              <Text variant="label" className="mb-1">
                Biggest gains
              </Text>
              {recap.data.topGains.slice(0, 3).map((gain, i) => (
                <Text key={i}>
                  {byId.get(gain.exerciseId)?.name ?? gain.exerciseId}:{' '}
                  {formatLoad(gain.fromKg, unit)} → {formatLoad(gain.toKg, unit)} (+
                  {gain.pct.toFixed(0)}%)
                </Text>
              ))}
            </View>
          ) : null}

          {recap.data.setsByGroup.length > 0 ? (
            <View className="mt-2">
              <Text variant="label" className="mb-1">
                Sets per muscle vs last month
              </Text>
              {recap.data.setsByGroup.map((row, i) => (
                <Text key={i}>
                  {(VOLUME_GROUP_LABELS as Record<string, string | undefined>)[row.group] ??
                    row.group}
                  : {row.sets} (was {row.prevSets})
                </Text>
              ))}
            </View>
          ) : null}

          <View className="mt-2">
            <Text variant="label" className="mb-1">
              Bodyweight
            </Text>
            {recap.data.bodyweight.startKg !== null && recap.data.bodyweight.endKg !== null ? (
              <Text>
                {formatLoad(recap.data.bodyweight.startKg, unit)} →{' '}
                {formatLoad(recap.data.bodyweight.endKg, unit)}
              </Text>
            ) : (
              <LogWeightPrompt testID="stats-recap-log-weight" />
            )}
          </View>
        </View>
      )}
    </Card>
  );
}
