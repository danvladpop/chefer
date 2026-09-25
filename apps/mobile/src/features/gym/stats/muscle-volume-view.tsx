import { useMemo, useState } from 'react';
import type { GymBootstrap, MuscleVolumeWeekDto, VolumeGroup } from '@chefer/types';
import { VOLUME_GROUPS } from '@chefer/types';
import { BarChart, Card, CardTitle, ChipGroup } from '@chefer/ui-mobile';
import { completedSetsByWeek, landmarkFor } from '@chefer/utils';
import { trpc } from '../../../lib/trpc';
import { MUSCLE_GROUP_FILTERS } from '../library-screens/exercise-filters';
import { useIsOnline } from '../library-screens/online-status';
import { libraryLookup } from '../use-gym-bootstrap';

// (b) Weekly sets per muscle (gym_plan.md §1.3 Stats #2): stacked bars over
// the last 8–12 weeks, with the productive-set band shaded for one selected
// group at a time.

const WEEKS = 12;
const GROUPS = Object.keys(VOLUME_GROUPS) as VolumeGroup[];

function shortLabel(weekStart: string): string {
  const d = new Date(`${weekStart}T00:00:00`);
  if (Number.isNaN(d.getTime())) return weekStart;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function MuscleVolumeView({ bootstrap }: { bootstrap: GymBootstrap }) {
  const online = useIsOnline();
  const [group, setGroup] = useState<VolumeGroup>('chest');

  const apiWeeks = trpc.gym.stats.muscleVolume.useQuery({ weeks: WEEKS }, { enabled: online });

  const localWeeks = useMemo(
    () => completedSetsByWeek(bootstrap.recentSessions, libraryLookup(bootstrap)),
    [bootstrap],
  );

  const weeks: MuscleVolumeWeekDto[] = apiWeeks.data ?? localWeeks;
  const experience = bootstrap.profile?.experience ?? 'BEGINNER';
  const landmark = landmarkFor(group, experience);

  const data = weeks.slice(-WEEKS).map((w) => ({
    label: shortLabel(w.weekStart),
    segments: GROUPS.map((g) => ({ key: g, value: w.sets[g] ?? 0 })),
  }));

  return (
    <Card testID="stats-muscle-volume">
      <CardTitle>Weekly sets per muscle</CardTitle>
      <ChipGroup
        testID="stats-muscle-volume-group"
        options={MUSCLE_GROUP_FILTERS}
        value={[group]}
        onChange={(v) => v[0] && setGroup(v[0])}
        className="mb-3"
      />
      <BarChart
        testID="stats-muscle-volume-chart"
        data={data}
        band={{ min: landmark.productiveMin, max: landmark.productiveMax }}
        emptyLabel="No completed sessions yet"
      />
    </Card>
  );
}
