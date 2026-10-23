import { useEffect, useState } from 'react';
import { ActivityIndicator, View, type LayoutChangeEvent } from 'react-native';
import Animated from 'react-native-reanimated';
import { keepPreviousData } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { AI_REVIEW_A11Y_LABEL } from '@chefer/types';
import {
  BarChart,
  enterFromSide,
  ErrorState,
  KeyboardAwareScrollView,
  LineChart,
  MacroRow,
  niceTicks,
  PressableScale,
  Screen,
  SegmentedControl,
  StatTile,
  StatTiles,
  Text,
  useThemeColors,
} from '@chefer/ui-mobile';
import {
  bodyWeightInUnit,
  bucketDays,
  cn,
  DEFAULT_STATS_RANGE,
  formatBodyWeight,
  formatDate,
  formatNumber,
  localDateStr,
  MEASUREMENTS_COPY,
  PROGRESS_PHOTOS_COPY,
  STATS_RANGE_LABELS,
  STATS_RANGE_SPAN,
  STATS_RANGES,
  statsBucketDays,
  summarizeWeightTrend,
  TREND_WEIGHT_EXPLAINER,
  trendChangeText,
  weightChangeTone,
  weightTrendSeries,
  withoutKcalLines,
  type StatsRangeDays,
} from '@chefer/utils';
import { AiGeneratedChip } from '../../../components/ai-generated-chip';
import { Icon } from '../../../components/icon';
import { useUnitSystem } from '../../../hooks/use-unit-system';
import { trpc } from '../../../lib/trpc';
import { BodyMeasurements } from '../../body/body-measurements';
import { ProgressPhotos } from '../../body/progress-photos';
import { CoachWhy } from '../../coach/coach-why';
import { WeightEntriesList } from '../../coach/weight-entries-list';
import { useNumbersMode } from '../../numbers-mode/numbers-mode';
import { openPremium } from '../../premium/open-premium';
import { ShellChromeProvider, ShellTopBar } from '../shell-chrome';
import { ActionButton, BoardCard, CardLink, SectionTitle } from '../today/parts';
import { WeightField } from '../today/weight-card';
import { eatingStats, MIN_LOGGED_DAYS, signedPct } from './stats-helpers';
import { StrengthTab } from './strength-tab';

// ─── Stats (10 Oct redesign, board Progress; revamped 2026-10-15) ───────────
// Opened from Today's top bar, and on Strength from Train. Two tabs under one
// range (1W / 1M / 3M / 1Y): Eating — the chef's weekly review in one line,
// tiles, intake bars against the target (weekly averages past a month) and
// average macros, then the weight trend with logging and corrections — and
// Strength (strength-tab.tsx). The eating numbers are the old screen's:
// averages on logged days only, three logged days before an average means
// anything (T-11.6).

type StatsTabKey = 'eating' | 'strength';
const TAB_OPTIONS: { value: StatsTabKey; label: string; testID: string }[] = [
  { value: 'eating', label: 'Eating', testID: 'stats-tab-eating' },
  { value: 'strength', label: 'Strength', testID: 'stats-tab-strength' },
];
const RANGE_OPTIONS = STATS_RANGES.map((n) => ({
  value: String(n),
  label: STATS_RANGE_LABELS[n],
  testID: `progress-range-${n}`,
}));
const DAY_MS = 86_400_000;
/** Weigh-ins fetched: the range, but never under 90 days, so Edit entries keeps them. */
const MIN_WEIGHT_DAYS = 90;
const CHART_H = 150;
// BarChart's own plot insets (packages/ui-mobile charts/bar-chart.tsx), so
// the target line below sits on the chart's y scale.
const BAR_PAD_TOP = 8;
const BAR_LABEL_H = 18;
const BAR_AXIS_W = 32;
const BAR_PAD_RIGHT = 4;

/** "2026-09-26" → "26 Sep", read as a local calendar day. */
function shortDate(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(`${value}T00:00:00`) : value;
  return formatDate(date, 'short');
}

/** The chef's weekly review in one line (it moved here from Today). */
function WeeklyReviewLine({ proteinOnly }: { proteinOnly: boolean }) {
  const colors = useThemeColors();
  const { data } = trpc.coach.currentReview.useQuery(undefined, { staleTime: 60_000 });
  const [expanded, setExpanded] = useState(false);
  if (!data || data.status === 'none') return null;
  if (data.status === 'teaser') {
    const first = proteinOnly ? withoutKcalLines(data.firstLine) : data.firstLine;
    return (
      <View className="gap-1">
        <PressableScale
          testID="stats-review-teaser"
          accessibilityRole="button"
          accessibilityHint="See what Premium adds"
          onPress={() => openPremium('coach-review')}
          className="min-h-12 flex-row items-center gap-3 rounded-card bg-brand-tint px-4 py-3"
        >
          <Icon name="chef" color={colors.brand} size={20} />
          <Text numberOfLines={2} className="min-w-0 flex-1 text-callout text-label">
            {first !== '' ? first : 'Your chef noticed something about your week…'}
          </Text>
        </PressableScale>
        {/* Lane D2: the reasoning is free; the number stays premium. */}
        {data.explanation ? (
          <CoachWhy explanation={data.explanation} tier="free" proteinOnly={proteinOnly} />
        ) : null}
      </View>
    );
  }
  const r = data.review;
  // WP-08: the review is written with calorie figures; protein-only drops those lines.
  const full = proteinOnly ? withoutKcalLines(r.reviewText) : r.reviewText;
  const first = full.split('\n')[0] ?? '';
  const hasMore = full.trim() !== first.trim();
  return (
    <View className="gap-1">
      <PressableScale
        testID="stats-review"
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityHint={
          hasMore ? (expanded ? 'Shows less' : 'Shows the full review') : undefined
        }
        disabled={!hasMore}
        onPress={() => setExpanded((e) => !e)}
        className="gap-1 rounded-card bg-brand-tint px-4 py-3"
      >
        <View className="flex-row items-start gap-3">
          <Icon name="chef" color={colors.brand} size={20} />
          <Text
            testID="stats-review-text"
            numberOfLines={expanded ? undefined : 2}
            className="min-w-0 flex-1 text-callout text-label"
          >
            {expanded ? full : first}
          </Text>
        </View>
        {/* R-14 (Art. 50): only when the model wrote the text, not the template. */}
        <AiGeneratedChip
          recipe={r}
          testID="stats-review-ai-chip"
          a11yLabel={AI_REVIEW_A11Y_LABEL}
        />
      </PressableScale>
      {r.explanation ? (
        <CoachWhy explanation={r.explanation} tier="premium" proteinOnly={proteinOnly} />
      ) : null}
    </View>
  );
}

function TargetLine({ value, top, label }: { value: number; top: number; label: string }) {
  const [height, setHeight] = useState(0);
  const plotBottom = CHART_H - BAR_LABEL_H;
  const y = BAR_PAD_TOP + (1 - value / top) * (plotBottom - BAR_PAD_TOP);
  return (
    <View
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      onLayout={(e: LayoutChangeEvent) => setHeight(e.nativeEvent.layout.height)}
      className="absolute inset-0"
    >
      {height > 0 && top > 0 ? (
        <>
          <View
            className="absolute border-t border-dashed border-label-secondary"
            style={{ top: y, left: BAR_AXIS_W, right: BAR_PAD_RIGHT }}
          />
          <Text
            className="absolute text-caption text-label-secondary"
            style={{ top: Math.max(0, y - 18), right: BAR_PAD_RIGHT }}
          >
            {label}
          </Text>
        </>
      ) : null}
    </View>
  );
}

export function StatsScreen() {
  // Train's "Strength stats" opens straight on Strength (`?tab=strength`).
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<StatsTabKey>(tabParam === 'strength' ? 'strength' : 'eating');
  useEffect(() => {
    if (tabParam === 'strength' || tabParam === 'eating') setTab(tabParam);
  }, [tabParam]);
  const [range, setRange] = useState<StatsRangeDays>(DEFAULT_STATS_RANGE);

  return (
    <ShellChromeProvider value={{ kind: 'pushed', fallback: '/home', title: 'Stats' }}>
      <Screen edges={['top', 'bottom', 'left', 'right']} className="bg-canvas px-0">
        <KeyboardAwareScrollView
          testID="stats-scroll"
          contentContainerClassName="gap-4 px-4 pb-8 pt-3"
        >
          <ShellTopBar />
          <SegmentedControl
            testID="stats-tab"
            accessibilityLabel="Stats for"
            options={TAB_OPTIONS}
            value={tab}
            onChange={setTab}
          />
          <SegmentedControl
            testID="progress-range"
            accessibilityLabel="Time range"
            options={RANGE_OPTIONS}
            value={String(range)}
            onChange={(v) => setRange(Number(v) as StatsRangeDays)}
          />
          {/* Premium motion: the tab's content slides in from its side. */}
          <Animated.View
            key={tab}
            entering={enterFromSide(tab === 'strength' ? 1 : -1)}
            className="gap-4"
          >
            {tab === 'strength' ? <StrengthTab range={range} /> : <EatingTab range={range} />}
          </Animated.View>
        </KeyboardAwareScrollView>
      </Screen>
    </ShellChromeProvider>
  );
}

function EatingTab({ range }: { range: StatsRangeDays }) {
  const colors = useThemeColors();
  const [logOpen, setLogOpen] = useState(false);
  const [entriesOpen, setEntriesOpen] = useState(false);
  const { proteinOnly } = useNumbersMode();
  const system = useUnitSystem();
  const {
    data: monthly,
    isLoading,
    isError,
    refetch,
  } = trpc.tracker.monthlySummary.useQuery(
    // UX-FOOD-20: the user's window, anchored on their own local "today".
    { localDate: localDateStr(), days: range },
    { staleTime: 60_000, placeholderData: keepPreviousData },
  );
  const { data: targets } = trpc.targets.get.useQuery(undefined, { staleTime: 60_000 });
  const weightQuery = trpc.tracker.weightHistory.useQuery(
    { days: Math.max(range, MIN_WEIGHT_DAYS) },
    { staleTime: 60_000, placeholderData: keepPreviousData },
  );
  const { data: preferences } = trpc.preferences.get.useQuery(undefined, { staleTime: 300_000 });

  const days = monthly?.days ?? [];
  const targetKcal = monthly?.dailyCalorieTarget ?? 2000;
  const eat = eatingStats(days, targetKcal);
  const macroTargets = targets?.effective;
  const proteinTarget = macroTargets?.proteinG ?? 0;
  const daysToGo = MIN_LOGGED_DAYS - eat.daysLogged;

  // Protein-only users (WP-08) chart protein against its target; everyone else
  // kcal. Past a month each bar is a week's average over its logged days.
  const weekly = statsBucketDays(range) === 7;
  const bars = bucketDays(days, statsBucketDays(range));
  const chartTarget = proteinOnly ? proteinTarget : targetKcal;
  const barData = bars.map((b) => ({
    label: shortDate(b.date),
    segments: b.hasLog
      ? [{ key: 'value', value: Math.round(proteinOnly ? b.totalProtein : b.totalKcal) }]
      : [],
  }));
  const barMax = Math.max(
    1,
    chartTarget,
    ...barData.flatMap((b) => b.segments.map((s) => s.value)),
  );
  const barTop = niceTicks({ min: 0, max: barMax * 1.05 }).max;

  // Every fetched weigh-in stays editable; the chart and the change follow the
  // range. Lane D1: the bold line is the trend weight (@chefer/utils), fed by
  // every fetched weigh-in so it has warmed up by the range start; the dots
  // are the readings. The change is the trend's, never painted as a failure.
  const weights = weightQuery.data ?? [];
  const since = Date.now() - range * DAY_MS;
  const series = weightTrendSeries(weights);
  const inRange = series.filter((p) => p.recordedAt.getTime() >= since);
  const latestWeight = weights.at(-1)?.weightKg;
  const trendNow = series.length > 1 ? series.at(-1)?.trendKg : undefined;
  const trendSummary = summarizeWeightTrend(series, { windowDays: range });
  const weightChange = trendChangeText(trendSummary, system, STATS_RANGE_SPAN[range]);
  const tone = trendSummary
    ? weightChangeTone(trendSummary.changeKg, preferences?.chefProfile?.goal)
    : 'neutral';
  // Time axis: x in days since epoch, so a two-week gap between weigh-ins looks like one.
  const weightData = inRange.map((p) => ({
    x: p.recordedAt.getTime() / DAY_MS,
    y: bodyWeightInUnit(p.weightKg, system),
  }));
  const trendData = inRange.map((p) => bodyWeightInUnit(p.trendKg, system));
  const weightLabels = (() => {
    const firstX = weightData.at(0)?.x;
    const lastX = weightData.at(-1)?.x;
    if (firstX == null || lastX == null || lastX - firstX < 1) return undefined;
    return [0, 0.5, 1].map((f) => {
      const x = firstX + (lastX - firstX) * f;
      return { x, label: shortDate(new Date(x * DAY_MS)) };
    });
  })();

  const avgTile = proteinOnly
    ? {
        value: eat.enoughDays ? String(eat.avgProtein) : '—',
        count: eat.enoughDays ? eat.avgProtein : undefined,
        unit: eat.enoughDays ? 'g' : undefined,
        label: 'avg protein / day',
      }
    : {
        value: eat.enoughDays ? formatNumber(eat.avgKcal) : '—',
        count: eat.enoughDays ? eat.avgKcal : undefined,
        unit: undefined,
        label: 'avg kcal / day',
      };
  const proteinPct =
    proteinTarget > 0 && eat.enoughDays
      ? Math.round(((eat.avgProtein - proteinTarget) / proteinTarget) * 100)
      : 0;

  return (
    <>
      <WeeklyReviewLine proteinOnly={proteinOnly} />

      {/* Eating */}
      <View testID="stats-eating" className="gap-3">
        <SectionTitle>Eating</SectionTitle>
        {isLoading ? (
          <View className="items-center py-12">
            <ActivityIndicator size="large" color={colors.brand} />
          </View>
        ) : isError && !monthly ? (
          // A failed load is not an empty history (audit F-X-3-1).
          <ErrorState
            testID="progress-error"
            title="Couldn't load your eating stats"
            icon={<Icon name="refresh" color={colors.labelTertiary} size={40} />}
            onRetry={() => void refetch()}
          />
        ) : (
          <BoardCard>
            <StatTiles>
              <StatTile
                testID="stats-avg"
                icon={<Icon name="flame" color={colors.brand} size={18} />}
                value={avgTile.value}
                {...(avgTile.count !== undefined && { count: avgTile.count })}
                {...(avgTile.unit && { unit: avgTile.unit })}
                label={avgTile.label}
              />
              <StatTile
                testID="stats-days"
                icon={<Icon name="checkmark" color={colors.brand} size={18} />}
                value={monthly ? String(eat.daysLogged) : '—'}
                {...(monthly && { count: eat.daysLogged })}
                label="days logged"
              />
              <StatTile
                testID="stats-vs-target"
                icon={<Icon name="trendDown" color={colors.brand} size={18} />}
                value={eat.enoughDays ? signedPct(proteinOnly ? proteinPct : eat.diffPct) : '—'}
                label="vs target"
              />
            </StatTiles>
            {monthly && !eat.enoughDays ? (
              <Text testID="progress-more-days" className="text-subhead text-label-secondary">
                {`Log ${daysToGo} more ${daysToGo === 1 ? 'day' : 'days'} to see your averages`}
              </Text>
            ) : null}

            {eat.daysLogged === 0 ? (
              <View className="items-center gap-1 py-6">
                <Text className="text-center text-callout text-label-secondary">
                  Nothing logged yet in these days.
                </Text>
                <PressableScale
                  testID="progress-open-tracker"
                  accessibilityRole="link"
                  onPress={() => router.push('/tracker')}
                  className="min-h-11 justify-center px-3"
                >
                  <Text className="text-callout font-semibold text-brand">Open your day</Text>
                </PressableScale>
              </View>
            ) : (
              <View className="gap-2">
                <View>
                  <BarChart
                    testID="stats-chart"
                    accessibilityLabel={`${proteinOnly ? 'Protein' : 'Calories'} logged on ${eat.daysLogged} of the last ${eat.windowDays} days${weekly ? ', as weekly averages,' : ''} against a target of ${formatNumber(chartTarget)}`}
                    data={barData}
                    seriesColors={{ value: colors.brand }}
                    // A zero-height band keeps the target inside the y domain;
                    // the dashed line itself is drawn on top (TargetLine).
                    band={{ min: chartTarget, max: chartTarget }}
                    labelEvery={Math.max(1, Math.ceil(bars.length / 3))}
                    formatY={(v) => formatNumber(v)}
                    height={CHART_H}
                  />
                  <TargetLine
                    value={chartTarget}
                    top={barTop}
                    label={
                      proteinOnly ? `${formatNumber(chartTarget)} g` : formatNumber(chartTarget)
                    }
                  />
                </View>
                {weekly ? (
                  <Text testID="stats-chart-weekly" className="text-caption text-label-secondary">
                    Each bar is a week: the daily average of the days you logged
                  </Text>
                ) : null}
              </View>
            )}

            {eat.enoughDays ? (
              <View testID="stats-macros" className="gap-3">
                <MacroRow
                  testID="stats-macro-protein"
                  macro="protein"
                  value={eat.avgProtein}
                  target={macroTargets?.proteinG ?? 0}
                />
                {proteinOnly ? null : (
                  <>
                    <MacroRow
                      testID="stats-macro-carbs"
                      macro="carbs"
                      value={eat.avgCarbs}
                      target={macroTargets?.carbsG ?? 0}
                    />
                    <MacroRow
                      testID="stats-macro-fat"
                      macro="fat"
                      value={eat.avgFat}
                      target={macroTargets?.fatG ?? 0}
                    />
                  </>
                )}
                <Text className="text-caption text-label-secondary">
                  Daily averages on logged days
                </Text>
              </View>
            ) : null}
          </BoardCard>
        )}
      </View>

      {/* Weight */}
      <View testID="progress-weight" className="gap-3">
        <SectionTitle>Weight</SectionTitle>
        <BoardCard>
          <View className="flex-row items-start justify-between gap-3">
            <View className="min-w-0 flex-1">
              {latestWeight != null ? (
                <Text testID="progress-weight-current" className="text-title1 font-bold text-label">
                  {formatBodyWeight(latestWeight, system)}
                </Text>
              ) : (
                <Text testID="progress-weight-empty" className="text-callout text-label-secondary">
                  No weigh-ins yet.
                </Text>
              )}
              {trendNow != null ? (
                <Text testID="progress-weight-trend" className="text-subhead text-label-secondary">
                  {`Trend ${formatBodyWeight(trendNow, system)}`}
                </Text>
              ) : null}
              {weightChange ? (
                <Text
                  testID="progress-weight-change"
                  className={cn(
                    'text-subhead',
                    tone === 'positive' ? 'text-positive' : 'text-label-secondary',
                  )}
                >
                  {weightChange}
                </Text>
              ) : null}
            </View>
            <ActionButton
              testID="stats-log-weight"
              label="Log weight"
              icon={logOpen ? 'close' : 'add'}
              accessibilityLabel={logOpen ? 'Close weigh-in' : 'Log weight'}
              onPress={() => setLogOpen((o) => !o)}
            />
          </View>
          {logOpen ? (
            <WeightField lastEntry={weights.at(-1) ?? null} testID="stats-weight" />
          ) : null}

          {weightQuery.isError && weights.length === 0 ? (
            <ErrorState
              testID="progress-weight-error"
              title="Couldn't load your weigh-ins"
              onRetry={() => void weightQuery.refetch()}
            />
          ) : weightQuery.isLoading ? (
            <View className="h-32 items-center justify-center">
              <ActivityIndicator color={colors.brand} />
            </View>
          ) : inRange.length > 1 ? (
            <View className="gap-2">
              <LineChart
                testID="progress-weight-chart"
                accessibilityLabel={`Weight over the last ${STATS_RANGE_SPAN[range]}, last weigh-in ${latestWeight != null ? formatBodyWeight(latestWeight, system) : ''}${trendNow != null ? `, trend ${formatBodyWeight(trendNow, system)}` : ''}`}
                data={weightData}
                trend={trendData}
                {...(weightLabels && { xLabels: weightLabels })}
                color={colors.brand}
                niceTicks
                height={150}
              />
              <Text
                testID="progress-weight-explainer"
                className="text-caption text-label-secondary"
              >
                {TREND_WEIGHT_EXPLAINER}
              </Text>
            </View>
          ) : weights.length > 0 ? (
            <Text testID="progress-weight-few" className="text-subhead text-label-secondary">
              {`Weigh in twice within ${STATS_RANGE_SPAN[range]} to see your trend here.`}
            </Text>
          ) : null}

          {weights.length > 0 ? (
            <>
              {entriesOpen ? <WeightEntriesList entries={weights} /> : null}
              <CardLink
                testID="stats-edit-entries"
                label={entriesOpen ? 'Hide entries' : 'Edit entries'}
                onPress={() => setEntriesOpen((o) => !o)}
              />
            </>
          ) : null}
        </BoardCard>
      </View>

      {/* Body measurements: free, one chart per measure (lane D3) */}
      <View className="gap-3">
        <SectionTitle>{MEASUREMENTS_COPY.title}</SectionTitle>
        <BoardCard>
          <BodyMeasurements />
        </BoardCard>
      </View>

      {/* Progress photos: on this phone only (lane D4) */}
      <View className="gap-3">
        <SectionTitle>{PROGRESS_PHOTOS_COPY.title}</SectionTitle>
        <BoardCard>
          <ProgressPhotos />
        </BoardCard>
      </View>
    </>
  );
}
