import { useMemo, useState } from 'react';
import { View } from 'react-native';
import type { E1rmSeriesDto, ExerciseDto, GymBootstrap, StatsRange } from '@chefer/types';
import {
  Button,
  Card,
  CardTitle,
  Chip,
  EmptyState,
  LineChart,
  SegmentedControl,
} from '@chefer/ui-mobile';
import { formatLoad, kgToUnit, unitLabel } from '@chefer/utils';
import { trpc } from '../../../lib/trpc';
import { useIsOnline } from '../library-screens/online-status';
import { ExercisePicker } from '../library/exercise-picker';
import { localE1rmSeries, topCompoundsByFrequency } from './local-engine';
import { LogWeightPrompt } from './log-weight-prompt';

// (a) Strength trend (gym_plan.md §1.3 Stats #1): e1RM line for a picked lift,
// defaulting to the top 3 compounds by frequency, with a range selector, PR
// dots, a bodyweight overlay and a relative-strength toggle.

const RANGE_OPTIONS: { value: StatsRange; label: string }[] = [
  { value: '3m', label: '3 m' },
  { value: '1y', label: '1 y' },
  { value: 'all', label: 'All' },
];

/** Range longer than the bootstrap's ~12-week `recentSessions` window needs the API series. */
function needsApiSeries(range: StatsRange): boolean {
  return range !== '3m';
}

function nearestBodyweightKg(
  points: readonly { localDate: string; weightKg: number }[],
  localDate: string,
  fallback: number | null,
): number | null {
  let best: number | null = null;
  for (const p of points) {
    if (p.localDate <= localDate) best = p.weightKg;
  }
  return best ?? fallback;
}

export function StrengthTrendView({ bootstrap }: { bootstrap: GymBootstrap }) {
  const online = useIsOnline();
  const [range, setRange] = useState<StatsRange>('3m');
  const [showBodyweight, setShowBodyweight] = useState(false);
  const [relativeStrength, setRelativeStrength] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const defaults = useMemo(
    () => topCompoundsByFrequency(bootstrap.recentSessions, bootstrap.library, 3),
    [bootstrap],
  );
  const [selected, setSelected] = useState<ExerciseDto | undefined>(defaults[0]);
  const exercise = selected ?? defaults[0];

  const apiSeries = trpc.gym.stats.e1rm.useQuery(
    { exerciseId: exercise?.id ?? '', range },
    { enabled: online && !!exercise && needsApiSeries(range) },
  );
  const bodyweightQuery = trpc.gym.stats.bodyweight.useQuery(
    { range },
    { enabled: online && showBodyweight },
  );

  const series: E1rmSeriesDto | undefined = exercise
    ? needsApiSeries(range) && apiSeries.data
      ? apiSeries.data
      : localE1rmSeries(bootstrap.recentSessions, exercise.id)
    : undefined;

  const bodyweightPoints = useMemo(() => bodyweightQuery.data ?? [], [bodyweightQuery.data]);
  const unit = bootstrap.profile?.unit ?? 'KG';

  const chartData = useMemo(() => {
    if (!series) return [];
    return series.points.map((p) => {
      const bw = relativeStrength
        ? nearestBodyweightKg(bodyweightPoints, p.localDate, bootstrap.bodyweightKg)
        : null;
      return {
        x: Date.parse(p.localDate),
        y: relativeStrength && bw ? p.e1rmKg / bw : p.e1rmKg,
        highlight: p.isPr,
      };
    });
  }, [series, relativeStrength, bodyweightPoints, bootstrap.bodyweightKg]);

  const trend = useMemo(() => {
    if (!series || relativeStrength) return undefined;
    return series.trend;
  }, [series, relativeStrength]);

  const secondary =
    showBodyweight && !relativeStrength && bodyweightPoints.length > 0
      ? {
          data: bodyweightPoints.map((p) => ({ x: Date.parse(p.localDate), y: p.weightKg })),
          formatY: (v: number) => `${kgToUnit(v, unit).toFixed(0)} ${unitLabel(unit)}`,
        }
      : undefined;

  if (defaults.length === 0) {
    return (
      <Card testID="stats-strength-trend-empty">
        <CardTitle>Strength trend</CardTitle>
        <EmptyState
          testID="stats-strength-trend-empty-state"
          title="Log your first workout to see your trend"
          description="Your top lifts will show up here once you've logged a few sessions."
        />
      </Card>
    );
  }

  return (
    <Card testID="stats-strength-trend">
      <CardTitle>Strength trend</CardTitle>
      <View className="mb-3 flex-row flex-wrap items-center gap-2">
        {defaults.map((ex) => (
          <Chip
            key={ex.id}
            testID={`stats-strength-exercise-${ex.id}`}
            label={ex.name}
            selected={exercise?.id === ex.id}
            onPress={() => setSelected(ex)}
          />
        ))}
        <Button
          testID="stats-strength-choose-exercise"
          size="sm"
          variant="secondary"
          onPress={() => setPickerOpen(true)}
        >
          Choose…
        </Button>
      </View>

      <SegmentedControl
        testID="stats-strength-range"
        options={RANGE_OPTIONS}
        value={range}
        onChange={setRange}
        accessibilityLabel="Range"
        className="mb-3"
      />

      <LineChart
        testID="stats-strength-chart"
        data={chartData}
        trend={trend}
        secondary={secondary}
        formatY={(v) => (relativeStrength ? v.toFixed(2) : formatLoad(v, unit))}
        emptyLabel="No sessions with this exercise yet"
      />

      <View className="mt-3 flex-row flex-wrap gap-2">
        <Chip
          testID="stats-strength-bodyweight-toggle"
          label="Bodyweight overlay"
          selected={showBodyweight}
          onPress={() => setShowBodyweight((v) => !v)}
        />
        <Chip
          testID="stats-strength-relative-toggle"
          label="Relative strength"
          selected={relativeStrength}
          onPress={() => setRelativeStrength((v) => !v)}
        />
      </View>

      {(showBodyweight || relativeStrength) && bootstrap.bodyweightKg === null ? (
        <LogWeightPrompt testID="stats-strength-log-weight" />
      ) : null}

      <ExercisePicker
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(ex) => {
          setSelected(ex);
          setPickerOpen(false);
        }}
        library={bootstrap.library}
        title="Choose a lift"
        testID="stats-strength-picker"
      />
    </Card>
  );
}
