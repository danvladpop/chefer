import { useMemo, useState } from 'react';
import { View } from 'react-native';
import type { GymBootstrap, MuscleVolumeWeekDto, VolumeGroup } from '@chefer/types';
import { VOLUME_GROUPS } from '@chefer/types';
import {
  BarChart,
  Card,
  CardTitle,
  chartPalette,
  ChipGroup,
  colors,
  Text,
} from '@chefer/ui-mobile';
import { completedSetsByWeek, landmarkFor, VOLUME_GROUP_LABELS } from '@chefer/utils';
import { trpc } from '../../../lib/trpc';
import { useIsOnline } from '../library-screens/online-status';
import { libraryLookup } from '../use-gym-bootstrap';

// (b) Weekly sets per muscle (gym_plan.md §1.3 Stats #2): stacked bars over
// the last 8–12 weeks, with the productive-set band shaded for one selected
// group at a time.

const WEEKS = 12;
const GROUPS = Object.keys(VOLUME_GROUPS) as VolumeGroup[];
// Volume stats chart the VOLUME groups only (the library's extra filter groups
// such as Forearms have no weekly-set landmarks).
const VOLUME_GROUP_FILTERS = GROUPS.map((g) => ({ value: g, label: VOLUME_GROUP_LABELS[g] }));

// T-05.6 (UX-05 F, CI-36): a fixed colour per muscle group, computed once so
// it drives both the stacked bars (`seriesColors`) and the legend below them
// — nothing in the stack is left to decode by memory or trial and error.
const SERIES_COLORS: Record<VolumeGroup, string> = Object.fromEntries(
  GROUPS.map((g, i) => [g, chartPalette[i % chartPalette.length] ?? colors.primary]),
) as Record<VolumeGroup, string>;

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
        options={VOLUME_GROUP_FILTERS}
        value={[group]}
        onChange={(v) => v[0] && setGroup(v[0])}
        className="mb-3"
      />
      <BarChart
        testID="stats-muscle-volume-chart"
        data={data}
        seriesColors={SERIES_COLORS}
        band={{ min: landmark.productiveMin, max: landmark.productiveMax }}
        emptyLabel="No completed sessions yet"
      />
      {/* UX-05 F (CI-36): a legend under the stacked bar — colour swatch +
          label, wraps at narrow widths. */}
      <View
        testID="stats-muscle-volume-legend"
        className="mt-2 flex-row flex-wrap gap-x-3 gap-y-1.5"
      >
        {GROUPS.map((g) => (
          <View key={g} className="flex-row items-center gap-1.5">
            <View
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: SERIES_COLORS[g] }}
            />
            <Text variant="muted" className="text-xs">
              {VOLUME_GROUP_LABELS[g]}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
}
