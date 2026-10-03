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
  Text,
} from '@chefer/ui-mobile';
import {
  bodyweightOn,
  formatLoad,
  formatRelativeStrength,
  GLOSSARY,
  kgToUnit,
  relativeStrength as relativeStrengthRatio,
  unitLabel,
} from '@chefer/utils';
import { GlossaryTerm } from '../../../components/glossary-term';
import { trpc } from '../../../lib/trpc';
import { useIsOnline } from '../library-screens/online-status';
import { ExercisePicker } from '../library/exercise-picker';
import { localE1rmSeries, topCompoundsByFrequency } from './local-engine';
import { LogWeightPrompt } from './log-weight-prompt';

/** "24 Sep 2026" for the tapped-point / latest-point caption. */
function longDate(localDate: string): string {
  const d = new Date(`${localDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return localDate;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

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
    { enabled: online && (showBodyweight || relativeStrength) },
  );

  const series: E1rmSeriesDto | undefined = exercise
    ? needsApiSeries(range) && apiSeries.data
      ? apiSeries.data
      : localE1rmSeries(bootstrap.recentSessions, exercise.id)
    : undefined;

  // UX-GYM-17: the weight from onboarding / preferences stands in until the
  // first weigh-in, so "× body weight" never plots the raw kg e1RM.
  const profileQuery = trpc.preferences.get.useQuery();
  const knownBodyweightKg =
    bootstrap.bodyweightKg ?? profileQuery.data?.chefProfile?.weightKg ?? null;
  const hasAnyBodyweight = (knownBodyweightKg ?? 0) > 0;

  const bodyweightPoints = useMemo(() => bodyweightQuery.data ?? [], [bodyweightQuery.data]);
  const unit = bootstrap.profile?.unit ?? 'KG';

  const chartData = useMemo(() => {
    if (!series) return [];
    const out: { x: number; y: number; highlight: boolean }[] = [];
    for (const p of series.points) {
      let y = p.e1rmKg;
      if (relativeStrength) {
        const ratio = relativeStrengthRatio(
          p.e1rmKg,
          bodyweightOn(bodyweightPoints, p.localDate, knownBodyweightKg),
        );
        if (ratio === null) continue; // no weight to divide by: leave the point off
        y = ratio;
      }
      out.push({ x: Date.parse(p.localDate), y, highlight: p.isPr });
    }
    return out;
  }, [series, relativeStrength, bodyweightPoints, knownBodyweightKg]);

  const trend = useMemo(() => {
    if (!series || relativeStrength) return undefined;
    return series.trend;
  }, [series, relativeStrength]);

  const latestPoint =
    series && series.points.length > 0 ? series.points[series.points.length - 1] : undefined;

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

      {/* UX-05 F (CI-36): captions the chart so "e1RM" is never unexplained. */}
      <View className="mb-1 flex-row flex-wrap items-center gap-1">
        <Text variant="muted" className="text-xs">
          Estimated 1-rep max
        </Text>
        <GlossaryTerm
          term="(e1RM)"
          title={GLOSSARY.e1rm?.term ?? 'Estimated 1RM'}
          definition={
            GLOSSARY.e1rm?.definition ??
            'Your estimated one-rep max, worked out from your recent sets.'
          }
          testID="stats-strength-e1rm-term"
          className="text-xs text-muted-foreground"
        />
      </View>

      <LineChart
        testID="stats-strength-chart"
        data={chartData}
        trend={trend}
        secondary={secondary}
        formatY={(v) => (relativeStrength ? formatRelativeStrength(v) : formatLoad(v, unit))}
        emptyLabel="No sessions with this exercise yet"
      />

      {/* UX-05 F (CI-36): the point detail a tap on the chart would show —
          the shared LineChart has no tap-tooltip yet, so this names the
          latest point (usually the one someone wants) until it does. */}
      {latestPoint ? (
        <Text testID="stats-strength-point-detail" variant="muted" className="mt-1 text-xs">
          {longDate(latestPoint.localDate)} · {formatLoad(latestPoint.weightKg, unit)} ×{' '}
          {latestPoint.reps} → e1RM {formatLoad(latestPoint.e1rmKg, unit)}
        </Text>
      ) : null}

      <View className="mt-3 flex-row flex-wrap gap-2">
        <Chip
          testID="stats-strength-bodyweight-toggle"
          label="Bodyweight overlay"
          selected={showBodyweight}
          onPress={() => setShowBodyweight((v) => !v)}
        />
        <Chip
          testID="stats-strength-relative-toggle"
          label="Strength ÷ body weight"
          accessibilityHint="Shows your estimated 1-rep max as a multiple of your body weight"
          selected={relativeStrength}
          disabled={!hasAnyBodyweight}
          onPress={() => setRelativeStrength((v) => !v)}
        />
      </View>

      {!hasAnyBodyweight ? (
        <Text testID="stats-strength-relative-disabled" variant="muted" className="mt-2 text-xs">
          Log your weight below to compare your strength with your body weight.
        </Text>
      ) : null}

      {relativeStrength ? (
        <Text testID="stats-strength-relative-note" variant="muted" className="mt-2 text-xs">
          Estimated 1-rep max divided by your body weight at the time (× body weight).
        </Text>
      ) : null}

      {!hasAnyBodyweight ? <LogWeightPrompt testID="stats-strength-log-weight" /> : null}

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
