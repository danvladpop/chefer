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

// UX-GYM-33: the palette has 6 colours but there are 12 muscle groups, so the
// old fixed map gave two muscles the same colour. The stack now shows the top 5
// groups (plus the selected one) in distinct colours and folds the rest into a
// neutral "Other" — the legend only lists what the bars actually use.
const TOP_GROUPS = 5;
const OTHER_KEY = 'other';

export function pickStackGroups(
  weeks: readonly MuscleVolumeWeekDto[],
  selected: VolumeGroup,
): VolumeGroup[] {
  const totals = new Map<VolumeGroup, number>(GROUPS.map((g) => [g, 0]));
  for (const w of weeks) {
    for (const g of GROUPS) totals.set(g, (totals.get(g) ?? 0) + (w.sets[g] ?? 0));
  }
  const ranked = GROUPS.filter((g) => (totals.get(g) ?? 0) > 0)
    .sort((a, b) => (totals.get(b) ?? 0) - (totals.get(a) ?? 0))
    .slice(0, TOP_GROUPS);
  const shown = new Set<VolumeGroup>(ranked);
  shown.add(selected);
  // Keep the library's group order so the stack reads the same week to week.
  return GROUPS.filter((g) => shown.has(g));
}

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

  const windowWeeks = weeks.slice(-WEEKS);
  const stackGroups = pickStackGroups(windowWeeks, group);
  const seriesColors: Record<string, string> = Object.fromEntries(
    stackGroups.map((g, i) => [g, chartPalette[i % chartPalette.length] ?? colors.primary]),
  );
  seriesColors[OTHER_KEY] = colors.mutedForeground;
  const hasOther = windowWeeks.some((w) =>
    GROUPS.some((g) => !stackGroups.includes(g) && (w.sets[g] ?? 0) > 0),
  );
  const data = windowWeeks.map((w) => ({
    label: shortLabel(w.weekStart),
    segments: [
      ...stackGroups.map((g) => ({ key: g, value: w.sets[g] ?? 0 })),
      {
        key: OTHER_KEY,
        value: GROUPS.filter((g) => !stackGroups.includes(g)).reduce(
          (n, g) => n + (w.sets[g] ?? 0),
          0,
        ),
      },
    ],
  }));
  const legend = [
    ...stackGroups.map((g) => ({ key: g, label: VOLUME_GROUP_LABELS[g] })),
    ...(hasOther ? [{ key: OTHER_KEY, label: 'Other' }] : []),
  ];

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
        seriesColors={seriesColors}
        band={{ min: landmark.productiveMin, max: landmark.productiveMax }}
        emptyLabel="No completed sessions yet"
      />
      {/* UX-05 F (CI-36): a legend under the stacked bar — colour swatch +
          label, wraps at narrow widths. */}
      <View
        testID="stats-muscle-volume-legend"
        className="mt-2 flex-row flex-wrap gap-x-3 gap-y-1.5"
      >
        {legend.map((item) => (
          <View key={item.key} className="flex-row items-center gap-1.5">
            <View
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: seriesColors[item.key] }}
            />
            <Text variant="muted" className="text-xs">
              {item.label}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
}
