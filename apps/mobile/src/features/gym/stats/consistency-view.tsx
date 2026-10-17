import type { GymBootstrap } from '@chefer/types';
import { StatTile, StatTiles, Text, useThemeColors, WeekGrid } from '@chefer/ui-mobile';
import { Icon } from '../../../components/icon';
import { trpc } from '../../../lib/trpc';
import { TrainCard } from '../../shell/train/train-cards';
import { useIsOnline } from '../library-screens/online-status';

// (c) Consistency (gym_plan.md §1.3 Stats #3): a grid of weeks by status
// (goal met / flex / paused / under / empty) with the current and best streak.
// Never red for a miss (gym_plan.md §1.2 principle 3) — WeekGrid already
// encodes that in its neutral "under" colour.

const WEEKS = 52;

export function ConsistencyView({ bootstrap }: { bootstrap: GymBootstrap }) {
  const colors = useThemeColors();
  const online = useIsOnline();
  const apiConsistency = trpc.gym.stats.consistency.useQuery({ weeks: WEEKS }, { enabled: online });

  const weeks = apiConsistency.data?.weeks ?? bootstrap.weeks;
  const streak = apiConsistency.data?.streak ?? bootstrap.streak;

  return (
    <TrainCard testID="stats-consistency">
      <Text accessibilityRole="header" className="text-headline font-semibold text-label">
        Consistency
      </Text>
      <StatTiles>
        <StatTile
          testID="stats-consistency-current"
          icon={<Icon name="flame" color={colors.brand} size={18} />}
          value={String(streak.current)}
          label="Current streak"
        />
        <StatTile
          testID="stats-consistency-best"
          icon={<Icon name="trophy" color={colors.brand} size={18} />}
          value={String(streak.best)}
          label="Best streak"
        />
      </StatTiles>
      <WeekGrid
        testID="stats-consistency-grid"
        weeks={weeks.map((w) => ({
          weekStart: w.weekStart,
          status: w.status,
          label: `Week of ${w.weekStart}: ${w.sessions} of ${w.goal}`,
        }))}
        showLegend
      />
    </TrainCard>
  );
}
