import { View } from 'react-native';
import type { GymBootstrap } from '@chefer/types';
import { Card, CardTitle, Text, WeekGrid } from '@chefer/ui-mobile';
import { trpc } from '../../../lib/trpc';
import { useIsOnline } from '../library-screens/online-status';

// (c) Consistency (gym_plan.md §1.3 Stats #3): a grid of weeks by status
// (goal met / flex / paused / under / empty) with the current and best streak.
// Never red for a miss (gym_plan.md §1.2 principle 3) — WeekGrid already
// encodes that in its neutral "under" colour.

const WEEKS = 52;

export function ConsistencyView({ bootstrap }: { bootstrap: GymBootstrap }) {
  const online = useIsOnline();
  const apiConsistency = trpc.gym.stats.consistency.useQuery({ weeks: WEEKS }, { enabled: online });

  const weeks = apiConsistency.data?.weeks ?? bootstrap.weeks;
  const streak = apiConsistency.data?.streak ?? bootstrap.streak;

  return (
    <Card testID="stats-consistency">
      <CardTitle>Consistency</CardTitle>
      <View className="mb-3 flex-row gap-4">
        <Text>
          Current streak: <Text className="font-semibold">{streak.current}</Text>
        </Text>
        <Text>
          Best: <Text className="font-semibold">{streak.best}</Text>
        </Text>
      </View>
      <WeekGrid
        testID="stats-consistency-grid"
        weeks={weeks.map((w) => ({
          weekStart: w.weekStart,
          status: w.status,
          label: `Week of ${w.weekStart}: ${w.sessions} of ${w.goal}`,
        }))}
        showLegend
      />
    </Card>
  );
}
