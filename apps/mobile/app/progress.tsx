import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { keepPreviousData } from '@tanstack/react-query';
import { router } from 'expo-router';
import {
  BarChart,
  Card,
  colors,
  ErrorState,
  KeyboardAwareScrollView,
  LineChart,
  Screen,
  SegmentedControl,
  Text,
} from '@chefer/ui-mobile';
import {
  bodyWeightInUnit,
  cn,
  DEFAULT_PROGRESS_RANGE,
  evenLabelIndices,
  formatBodyWeight,
  formatDate,
  formatKcal,
  formatNumber,
  isLoggedDay,
  localDateStr,
  PROGRESS_RANGES,
  weightChangeTone,
  type ProgressRange,
  type WeightChangeTone,
} from '@chefer/utils';
import { WeightEntriesList } from '../src/features/coach/weight-entries-list';
import { WeightLogForm } from '../src/features/coach/weight-log-form';
import { trpc } from '../src/lib/trpc';

// Progress — port of apps/web (dashboard)/progress/page.tsx (audit TRK-4).
// Charts use the in-house react-native-svg LineChart/BarChart from
// @chefer/ui-mobile. Deviations, deliberate: no tooltips (charts are glanceable
// on a phone; the entries list carries exact values); the weight chart uses a
// time x-axis rather than web's evenly spaced categories, and the change is
// coloured by goal — gaining is good news for GAIN_MUSCLE (audit F-TRK-4-1).

const MACRO_COLORS = { protein: '#3b82f6', carbs: '#10b981', fat: '#f59e0b' } as const;
const DAY_MS = 86_400_000;
/** T-11.6: an average or a percentage needs at least this many logged days to mean anything. */
const MIN_LOGGED_DAYS = 3;
const RANGE_OPTIONS = PROGRESS_RANGES.map((n) => ({
  value: String(n),
  label: `${n} days`,
  testID: `progress-range-${n}`,
}));

const TONE_CLASS: Record<WeightChangeTone, string> = {
  positive: 'text-emerald-600',
  negative: 'text-red-500',
  neutral: 'text-gray-800',
};

const TONE_SUFFIX: Record<WeightChangeTone, string> = {
  positive: ', in line with your goal',
  negative: ', away from your goal',
  neutral: '',
};

/** "2026-09-26" → "26 Sep", read as a local calendar day (no UTC shift). */
function shortDate(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(`${value}T00:00:00`) : value;
  return formatDate(date, 'short');
}

function SectionLabel({ children }: { children: string }) {
  return (
    <Text className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-500">
      {children}
    </Text>
  );
}

function StatTile({
  icon,
  iconColor,
  label,
  value,
  testID,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  label: string;
  value: string;
  testID: string;
}) {
  return (
    <Card className="min-w-0 flex-1 gap-1 p-3">
      <View className="flex-row items-center gap-1">
        <Ionicons name={icon} size={14} color={iconColor} />
        <Text numberOfLines={2} className="min-w-0 flex-1 text-xs text-muted-foreground">
          {label}
        </Text>
      </View>
      <Text testID={testID} className="text-lg font-bold text-gray-800">
        {value}
      </Text>
    </Card>
  );
}

export default function ProgressScreen() {
  const [range, setRange] = useState<ProgressRange>(DEFAULT_PROGRESS_RANGE);
  const {
    data: monthly,
    isLoading,
    isError,
    refetch,
  } = trpc.tracker.monthlySummary.useQuery(
    // UX-FOOD-20: the window is the user's to pick (7 / 28 / 90 days), anchored
    // on their own local "today". Switching keeps the old chart until the new
    // one arrives, and an older API that ignores `days` still answers 28.
    { localDate: localDateStr(), days: range },
    { staleTime: 60_000, placeholderData: keepPreviousData },
  );
  const weightQuery = trpc.tracker.weightHistory.useQuery({ days: 90 }, { staleTime: 60_000 });
  const { data: preferences } = trpc.preferences.get.useQuery(undefined, { staleTime: 300_000 });

  const days = monthly?.days ?? [];
  const target = monthly?.dailyCalorieTarget ?? 2000;
  // UX-FOOD-20: a day whose entries were all deleted keeps an empty log row —
  // only days with something in them count as logged.
  const loggedDays = days.filter(isLoggedDay);
  const windowDays = days.length;
  const daysLogged = loggedDays.length;
  const enoughDays = daysLogged >= MIN_LOGGED_DAYS;
  const avgKcal = enoughDays
    ? Math.round(loggedDays.reduce((s, d) => s + d.totalKcal, 0) / daysLogged)
    : 0;
  const diffPct = target > 0 ? Math.round(((avgKcal - target) / target) * 100) : 0;
  const daysToGo = MIN_LOGGED_DAYS - daysLogged;
  // This week = the last 7 days of the window, and again only from >= 3 logged days.
  const weekLogged = days.slice(-7).filter(isLoggedDay);
  const weekAvg =
    weekLogged.length >= MIN_LOGGED_DAYS
      ? weekLogged.reduce((s, d) => s + d.totalKcal, 0) / weekLogged.length
      : null;
  const weekPct =
    weekAvg != null && target > 0 ? Math.round(((weekAvg - target) / target) * 100) : null;
  const weekLine =
    weekPct == null
      ? null
      : Math.abs(weekPct) < 2
        ? 'About on your target this week'
        : `About ${Math.abs(weekPct)} % ${weekPct < 0 ? 'under' : 'over'} your target this week`;

  // x = day index, so unlogged days leave a gap on the axis instead of
  // collapsing the month.
  const calorieData = days.flatMap((d, i) => (isLoggedDay(d) ? [{ x: i, y: d.totalKcal }] : []));
  // Evenly spaced labels, first and last included (no "21, 27" pair at the end).
  const calorieLabels = evenLabelIndices(days.length).map((i) => ({
    x: i,
    label: shortDate(days[i]?.date ?? ''),
  }));

  const macroData = days.map((d) => ({
    label: shortDate(d.date),
    segments: isLoggedDay(d)
      ? [
          { key: 'protein', value: Math.round(d.totalProtein) },
          { key: 'carbs', value: Math.round(d.totalCarbs) },
          { key: 'fat', value: Math.round(d.totalFat) },
        ]
      : [],
  }));

  // Stored in kg; charted and labelled in the user's unit (backlog P2-6).
  const system = preferences?.chefProfile?.preferredUnits ?? 'METRIC';
  const weights = weightQuery.data ?? [];
  const latestWeight = weights.at(-1)?.weightKg;
  const firstWeight = weights.at(0)?.weightKg;
  const weightDelta =
    latestWeight != null && firstWeight != null && weights.length > 1
      ? latestWeight - firstWeight
      : null;
  const tone =
    weightDelta != null ? weightChangeTone(weightDelta, preferences?.chefProfile?.goal) : 'neutral';

  // Time axis: x in days since epoch, so a two-week gap between weigh-ins
  // looks like one.
  const weightData = weights.map((w) => ({
    x: new Date(w.recordedAt).getTime() / DAY_MS,
    y: bodyWeightInUnit(w.weightKg, system),
  }));
  const weightLabels = (() => {
    const firstX = weightData.at(0)?.x;
    const lastX = weightData.at(-1)?.x;
    if (firstX == null || lastX == null || lastX - firstX < 1) return undefined;
    return [0, 1 / 3, 2 / 3, 1].map((f) => {
      const x = firstX + (lastX - firstX) * f;
      return { x, label: shortDate(new Date(x * DAY_MS)) };
    });
  })();

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
            Insights
          </Text>
          <Text testID="progress-title" variant="title">
            Progress
          </Text>
        </View>
      </View>

      <KeyboardAwareScrollView contentContainerClassName="gap-4 px-4 pb-8">
        {/* Stat summary */}
        <View className="flex-row gap-2">
          <StatTile
            testID="progress-stat-days"
            icon="flame-outline"
            iconColor={colors.primary}
            label="Days logged"
            value={monthly ? String(daysLogged) : '—'}
          />
          <StatTile
            testID="progress-stat-avg"
            icon="trending-up-outline"
            iconColor="#3b82f6"
            label="Avg kcal"
            value={avgKcal > 0 ? formatKcal(avgKcal) : '—'}
          />
          <StatTile
            testID="progress-stat-vs-target"
            icon="scale-outline"
            iconColor="#10b981"
            label="vs target"
            value={avgKcal > 0 ? `${diffPct > 0 ? '+' : ''}${diffPct}%` : '—'}
          />
        </View>

        <SegmentedControl
          testID="progress-range"
          accessibilityLabel="Time range"
          options={RANGE_OPTIONS}
          value={String(range)}
          onChange={(v) => setRange(Number(v) as ProgressRange)}
        />

        {monthly && !enoughDays && (
          <Text testID="progress-more-days" variant="muted" className="text-sm">
            Log {daysToGo} more {daysToGo === 1 ? 'day' : 'days'} to see your average
          </Text>
        )}
        {weekLine && (
          <Text testID="progress-week-line" variant="muted" className="text-sm">
            {weekLine}
          </Text>
        )}

        {isLoading ? (
          <View className="items-center py-12">
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : isError && !monthly ? (
          // A failed load is not an empty history (audit F-X-3-1).
          <ErrorState
            testID="progress-error"
            title="Couldn't load your progress"
            icon={<Ionicons name="cloud-offline-outline" size={40} color="#9ca3af" />}
            onRetry={() => void refetch()}
          />
        ) : (
          <>
            {/* Calories vs target */}
            <Card testID="progress-calories">
              <SectionLabel>{`Calories — last ${windowDays} days`}</SectionLabel>
              {daysLogged === 0 ? (
                <View className="h-40 items-center justify-center gap-1">
                  <Text variant="muted" className="text-center text-sm">
                    No log data yet — start tracking in the Tracker.
                  </Text>
                  <Pressable
                    testID="progress-open-tracker"
                    accessibilityRole="link"
                    onPress={() => router.push('/tracker')}
                    className="min-h-11 justify-center px-3"
                  >
                    <Text className="text-sm font-medium text-primary">Open Tracker</Text>
                  </Pressable>
                </View>
              ) : (
                <LineChart
                  testID="progress-calories-chart"
                  accessibilityLabel={`Calories logged on ${daysLogged} of the last ${windowDays} days, average ${avgKcal} against a target of ${target}`}
                  data={calorieData}
                  xLabels={calorieLabels}
                  xDomain={{ min: 0, max: Math.max(days.length - 1, 1) }}
                  reference={{ y: target, label: 'Target' }}
                  yFloor={0}
                  niceTicks
                  formatY={(v) => formatNumber(v)}
                  height={200}
                />
              )}
            </Card>

            {/* Macro breakdown */}
            <Card testID="progress-macros">
              <SectionLabel>{`Macros — last ${windowDays} days (g)`}</SectionLabel>
              {daysLogged === 0 ? (
                <View
                  testID="progress-macros-empty"
                  className="h-40 items-center justify-center gap-1"
                >
                  <Text variant="muted" className="text-center text-sm">
                    Log a meal to see your protein, carbs and fat here.
                  </Text>
                  <Pressable
                    testID="progress-macros-open-tracker"
                    accessibilityRole="link"
                    onPress={() => router.push('/tracker')}
                    className="min-h-11 justify-center px-3"
                  >
                    <Text className="text-sm font-medium text-primary">Open Tracker</Text>
                  </Pressable>
                </View>
              ) : (
                <>
                  <BarChart
                    testID="progress-macros-chart"
                    accessibilityLabel={`Daily protein, carbs and fat in grams, last ${windowDays} days`}
                    data={macroData}
                    seriesColors={MACRO_COLORS}
                    labelEvery={Math.max(1, Math.ceil(windowDays / 4))}
                    height={200}
                  />
                  <View className="mt-2 flex-row justify-center gap-4">
                    {(
                      [
                        ['Protein', MACRO_COLORS.protein],
                        ['Carbs', MACRO_COLORS.carbs],
                        ['Fat', MACRO_COLORS.fat],
                      ] as const
                    ).map(([label, color]) => (
                      <View key={label} className="flex-row items-center gap-1.5">
                        <View
                          className="h-2.5 w-2.5 rounded-sm"
                          style={{ backgroundColor: color }}
                        />
                        <Text className="text-xs text-gray-600">{label}</Text>
                      </View>
                    ))}
                  </View>
                </>
              )}
            </Card>
          </>
        )}

        {/* Weight */}
        <Card testID="progress-weight">
          <SectionLabel>Weight tracking</SectionLabel>

          {latestWeight != null && (
            <View className="mb-3 flex-row flex-wrap gap-x-4 gap-y-1">
              <Text className="text-sm text-gray-500">
                Current:{' '}
                <Text testID="progress-weight-current" className="text-sm font-semibold">
                  {formatBodyWeight(latestWeight, system)}
                </Text>
              </Text>
              {weightDelta != null && Math.abs(weightDelta) >= 0.05 && (
                <Text className="text-sm text-gray-500">
                  Change (90d):{' '}
                  <Text
                    testID="progress-weight-change"
                    // Colour alone doesn't tell a screen reader which way is good.
                    accessibilityLabel={`${formatBodyWeight(weightDelta, system, { signed: true })}${TONE_SUFFIX[tone]}`}
                    className={cn('text-sm font-semibold', TONE_CLASS[tone])}
                  >
                    {formatBodyWeight(weightDelta, system, { signed: true })}
                  </Text>
                </Text>
              )}
            </View>
          )}

          {weightQuery.isError && weights.length === 0 ? (
            <ErrorState
              testID="progress-weight-error"
              title="Couldn't load your weigh-ins"
              onRetry={() => void weightQuery.refetch()}
            />
          ) : weightQuery.isLoading ? (
            <View className="h-40 items-center justify-center">
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : weights.length > 0 ? (
            <LineChart
              testID="progress-weight-chart"
              accessibilityLabel={`Weight over the last 90 days, currently ${latestWeight != null ? formatBodyWeight(latestWeight, system) : ''}`}
              data={weightData}
              trend={weightData.map((p) => p.y)}
              {...(weightLabels && { xLabels: weightLabels })}
              color="#10b981"
              niceTicks
              height={170}
            />
          ) : (
            <Text testID="progress-weight-empty" variant="muted" className="mb-2 text-sm">
              No weight entries yet. Log your first entry below.
            </Text>
          )}

          <View className="mt-3">
            <WeightLogForm
              lastEntry={weights.at(-1) ?? null}
              placeholder={system === 'IMPERIAL' ? '160.5' : '72.5'}
            />
          </View>
          {weights.length > 0 && <WeightEntriesList entries={weights} />}
        </Card>
      </KeyboardAwareScrollView>
    </Screen>
  );
}
