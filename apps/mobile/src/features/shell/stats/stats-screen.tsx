import { useState } from 'react';
import { ActivityIndicator, View, type LayoutChangeEvent } from 'react-native';
import { keepPreviousData, skipToken, useQuery } from '@tanstack/react-query';
import { getQueryKey } from '@trpc/react-query';
import { router } from 'expo-router';
import { AI_REVIEW_A11Y_LABEL, type GymBootstrap } from '@chefer/types';
import {
  BarChart,
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
  cn,
  DEFAULT_PROGRESS_RANGE,
  formatBodyWeight,
  formatDate,
  formatNumber,
  isLoggedDay,
  localDateStr,
  PROGRESS_RANGES,
  weightChangeTone,
  withoutKcalLines,
  type ProgressRange,
} from '@chefer/utils';
import { AiGeneratedChip } from '../../../components/ai-generated-chip';
import { Icon } from '../../../components/icon';
import { useUnitSystem } from '../../../hooks/use-unit-system';
import { trpc } from '../../../lib/trpc';
import { WeightEntriesList } from '../../coach/weight-entries-list';
import { localDate } from '../../gym/offline/ids';
import { useNumbersMode } from '../../numbers-mode/numbers-mode';
import { openPremium } from '../../premium/open-premium';
import { ShellChromeProvider, ShellTopBar } from '../shell-chrome';
import { ActionButton, BoardCard, CardLink, SectionTitle } from '../today/parts';
import { weightChangeText } from '../today/today-helpers';
import { WeightField } from '../today/weight-card';
import {
  eatingStats,
  MIN_LOGGED_DAYS,
  signedPct,
  trainingStats,
  weekCells,
  type WeekCell,
} from './stats-helpers';

// ─── Stats (10 Oct redesign, board Progress) ────────────────────────────────
// The old Progress screen, renamed and opened from Today's top bar: one range
// (7 / 28 / 90 days) for eating, the chef's weekly review in one line (it left
// Today), the weight trend with logging and corrections, and — for people who
// train — the week streak, workouts, new PRs and the last eight weeks. The
// numbers are the old screen's: averages on logged days only, three logged
// days before an average means anything (T-11.6), weight over 90 days.

const RANGE_OPTIONS = PROGRESS_RANGES.map((n) => ({
  value: String(n),
  label: `${n} days`,
  testID: `progress-range-${n}`,
}));
const DAY_MS = 86_400_000;
const WEIGHT_DAYS = 90;
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
    );
  }
  const r = data.review;
  // WP-08: the review is written with calorie figures; protein-only drops those lines.
  const full = proteinOnly ? withoutKcalLines(r.reviewText) : r.reviewText;
  const first = full.split('\n')[0] ?? '';
  const hasMore = full.trim() !== first.trim();
  return (
    <PressableScale
      testID="stats-review"
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      accessibilityHint={hasMore ? (expanded ? 'Shows less' : 'Shows the full review') : undefined}
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
      <AiGeneratedChip recipe={r} testID="stats-review-ai-chip" a11yLabel={AI_REVIEW_A11Y_LABEL} />
    </PressableScale>
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

function WeekStrip({ cells }: { cells: WeekCell[] }) {
  return (
    <View testID="stats-weeks" className="flex-row gap-1.5">
      {cells.map((cell) => (
        <View
          key={cell.weekStart}
          accessible
          accessibilityLabel={cell.label}
          className={cn(
            'h-9 min-w-0 flex-1 items-center justify-center rounded-inner',
            cell.kind === 'met' && 'bg-brand',
            cell.kind === 'flex' && 'bg-brand-tint',
            cell.kind === 'paused' && 'bg-surface-sunken',
            cell.kind === 'current' && 'border-2 border-brand',
            cell.kind === 'missed' && 'border border-separator',
          )}
        >
          <Text
            className={cn(
              'text-caption font-bold',
              cell.kind === 'met' ? 'text-brand-on' : 'text-brand',
            )}
          >
            {cell.text}
          </Text>
        </View>
      ))}
    </View>
  );
}

/**
 * The persisted gym bootstrap, read from the cache that Today and Train keep
 * fresh (useGymBootstrap): Stats never owns the gym read model, so a visit
 * costs no gym request and works offline. The input-free key is the one
 * use-gym-bootstrap.ts uses, computed at render so this screen's module load
 * never touches the gym client.
 */
function useCachedGymBootstrap(): GymBootstrap | undefined {
  const queryKey = getQueryKey(trpc.gym.bootstrap, undefined, 'query');
  // `skipToken`: observe the cached entry without ever fetching (a key-only
  // query with no queryFn logs "No queryFn was passed" when React Query
  // touches it, e.g. on refocus).
  return useQuery<GymBootstrap>({ queryKey, queryFn: skipToken }).data;
}

function TrainingStatsSection({ range }: { range: ProgressRange }) {
  const colors = useThemeColors();
  const bootstrap = useCachedGymBootstrap();
  // Only people who train: a gym profile with something on record.
  if (!bootstrap?.profile) return null;
  if (bootstrap.recentSessions.length === 0 && bootstrap.weeks.length === 0) return null;
  const stats = trainingStats(bootstrap, localDate(), range);
  const cells = weekCells(bootstrap.weeks);
  const suffix = stats.clipped ? ', last 12 weeks' : '';
  return (
    <View testID="stats-training" className="gap-3">
      <SectionTitle>Training</SectionTitle>
      <BoardCard>
        <StatTiles>
          <StatTile
            testID="stats-streak"
            icon={<Icon name="flame" color={colors.brand} size={18} />}
            value={String(stats.streakWeeks)}
            label="week streak"
          />
          <StatTile
            testID="stats-workouts"
            icon={<Icon name="barbell" color={colors.brand} size={18} />}
            value={String(stats.workouts)}
            label={`workouts${suffix}`}
          />
          <StatTile
            testID="stats-prs"
            icon={<Icon name="star" color={colors.brand} size={18} />}
            value={String(stats.newPrs)}
            label={`new PRs${suffix}`}
          />
        </StatTiles>
        {cells.length > 0 ? (
          <View className="gap-2">
            <Text className="text-subhead font-semibold text-label">
              {`Last ${cells.length} ${cells.length === 1 ? 'week' : 'weeks'}`}
            </Text>
            <WeekStrip cells={cells} />
          </View>
        ) : null}
        <CardLink
          testID="stats-strength"
          label="Strength and history"
          onPress={() => router.push('/training/stats')}
        />
      </BoardCard>
    </View>
  );
}

export function StatsScreen() {
  const colors = useThemeColors();
  const [range, setRange] = useState<ProgressRange>(DEFAULT_PROGRESS_RANGE);
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
    { days: WEIGHT_DAYS },
    { staleTime: 60_000 },
  );
  const { data: preferences } = trpc.preferences.get.useQuery(undefined, { staleTime: 300_000 });

  const days = monthly?.days ?? [];
  const targetKcal = monthly?.dailyCalorieTarget ?? 2000;
  const eat = eatingStats(days, targetKcal);
  const macroTargets = targets?.effective;
  const proteinTarget = macroTargets?.proteinG ?? 0;
  const daysToGo = MIN_LOGGED_DAYS - eat.daysLogged;

  // Protein-only users (WP-08) chart protein against its target; everyone else kcal.
  const chartTarget = proteinOnly ? proteinTarget : targetKcal;
  const barData = days.map((d) => ({
    label: shortDate(d.date),
    segments: isLoggedDay(d)
      ? [{ key: 'value', value: Math.round(proteinOnly ? d.totalProtein : d.totalKcal) }]
      : [],
  }));
  const barMax = Math.max(
    1,
    chartTarget,
    ...barData.flatMap((b) => b.segments.map((s) => s.value)),
  );
  const barTop = niceTicks({ min: 0, max: barMax * 1.05 }).max;

  const weights = weightQuery.data ?? [];
  const latestWeight = weights.at(-1)?.weightKg;
  const firstWeight = weights.at(0)?.weightKg;
  const weightChange = weightChangeText(weights, system, WEIGHT_DAYS);
  const tone =
    latestWeight != null && firstWeight != null && weights.length > 1
      ? weightChangeTone(latestWeight - firstWeight, preferences?.chefProfile?.goal)
      : 'neutral';
  // Time axis: x in days since epoch, so a two-week gap between weigh-ins looks like one.
  const weightData = weights.map((w) => ({
    x: new Date(w.recordedAt).getTime() / DAY_MS,
    y: bodyWeightInUnit(w.weightKg, system),
  }));
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
    ? { value: eat.enoughDays ? `${eat.avgProtein} g` : '—', label: 'avg protein / day' }
    : { value: eat.enoughDays ? formatNumber(eat.avgKcal) : '—', label: 'avg kcal / day' };
  const proteinPct =
    proteinTarget > 0 && eat.enoughDays
      ? Math.round(((eat.avgProtein - proteinTarget) / proteinTarget) * 100)
      : 0;

  return (
    <ShellChromeProvider value={{ kind: 'pushed', fallback: '/home', title: 'Stats' }}>
      <Screen edges={['top', 'bottom', 'left', 'right']} className="bg-canvas px-0">
        <KeyboardAwareScrollView
          testID="stats-scroll"
          contentContainerClassName="gap-4 px-4 pb-8 pt-3"
        >
          <ShellTopBar />
          <SegmentedControl
            testID="progress-range"
            accessibilityLabel="Time range"
            options={RANGE_OPTIONS}
            value={String(range)}
            onChange={(v) => setRange(Number(v) as ProgressRange)}
          />

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
                    label={avgTile.label}
                  />
                  <StatTile
                    testID="stats-days"
                    icon={<Icon name="checkmark" color={colors.brand} size={18} />}
                    value={monthly ? String(eat.daysLogged) : '—'}
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
                  <View>
                    <BarChart
                      testID="stats-chart"
                      accessibilityLabel={`${proteinOnly ? 'Protein' : 'Calories'} logged on ${eat.daysLogged} of the last ${eat.windowDays} days against a target of ${formatNumber(chartTarget)}`}
                      data={barData}
                      seriesColors={{ value: colors.brand }}
                      // A zero-height band keeps the target inside the y domain;
                      // the dashed line itself is drawn on top (TargetLine).
                      band={{ min: chartTarget, max: chartTarget }}
                      labelEvery={Math.max(1, Math.ceil(days.length / 3))}
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
                    <Text
                      testID="progress-weight-current"
                      className="text-title1 font-bold text-label"
                    >
                      {formatBodyWeight(latestWeight, system)}
                    </Text>
                  ) : (
                    <Text
                      testID="progress-weight-empty"
                      className="text-callout text-label-secondary"
                    >
                      No weigh-ins yet.
                    </Text>
                  )}
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
              ) : weights.length > 1 ? (
                <LineChart
                  testID="progress-weight-chart"
                  accessibilityLabel={`Weight over the last ${WEIGHT_DAYS} days, currently ${latestWeight != null ? formatBodyWeight(latestWeight, system) : ''}`}
                  data={weightData}
                  {...(weightLabels && { xLabels: weightLabels })}
                  color={colors.brand}
                  niceTicks
                  height={150}
                />
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

          <TrainingStatsSection range={range} />
        </KeyboardAwareScrollView>
      </Screen>
    </ShellChromeProvider>
  );
}
