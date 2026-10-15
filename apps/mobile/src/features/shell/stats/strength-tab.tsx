import { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';
import { skipToken, useQuery } from '@tanstack/react-query';
import { getQueryKey } from '@trpc/react-query';
import { router } from 'expo-router';
import type { ExerciseDto, GymBootstrap, MuscleVolumeWeekDto, PersonalRecord } from '@chefer/types';
import {
  BarChart,
  PressableScale,
  ProgressBar,
  StatTile,
  StatTiles,
  Text,
  useThemeColors,
} from '@chefer/ui-mobile';
import {
  collectPrs,
  completedSetsByWeek,
  formatDate,
  formatLoad,
  VOLUME_GROUP_LABELS,
  type StatsRangeDays,
} from '@chefer/utils';
import { Icon } from '../../../components/icon';
import { trpc } from '../../../lib/trpc';
import { useIsOnline } from '../../gym/library-screens/online-status';
import { localDate } from '../../gym/offline/ids';
import { localE1rmSeries } from '../../gym/stats/local-engine';
import { BoardCard, CardLink, SectionTitle } from '../today/parts';
import {
  BOOTSTRAP_SESSION_DAYS,
  liftChangeText,
  liftSummary,
  muscleSets,
  needsOlderHistory,
  olderHistoryCursor,
  pickLifts,
  rangeStart,
  recentPrs,
  thisWeekDays,
  trainingStats,
  trainingStatsForYear,
  trainingStatsWithHistory,
  workoutWeekBars,
} from './stats-helpers';

// ─── Stats › Strength (2026-10-15 revamp) ───────────────────────────────────
// The training half of Stats, one tap from the top instead of a link at the
// bottom: workouts, new PRs and the week streak; workouts per week against
// the goal; each main lift's best set and how much stronger it got, in plain
// words; working sets per muscle; and the latest PRs. The e1RM curves, the
// consistency grid and the monthly recap stay one tap away (/training/stats).
// Up to 12 weeks everything comes from the cached gym bootstrap (works
// offline); 3M and 1Y add the server's history where the cache stops.

/** Older history is a few weeks old by definition: no need to refetch it often. */
const HISTORY_STALE_MS = 5 * 60_000;
/** One `gym.session.list` page: far more than six days of training can hold. */
const OLDER_PAGE = 50;
/** The PR timeline (newest first): a year of new PRs fits well inside it. */
const PR_TIMELINE_LIMIT = 200;
const YEAR = 365;
/** Lifts shown in "Your lifts". */
const LIFTS = 4;

/** "2026-09-26" → "26 Sep", read as a local calendar day. */
function shortDate(value: string): string {
  return formatDate(new Date(`${value}T00:00:00`), 'short');
}

/**
 * The persisted gym bootstrap, read from the cache that Today and Train keep
 * fresh (useGymBootstrap): Stats never owns the gym read model, so a visit
 * costs no gym request and works offline. The input-free key is the one
 * use-gym-bootstrap.ts uses, computed at render so this screen's module load
 * never touches the gym client.
 */
export function useCachedGymBootstrap(): GymBootstrap | undefined {
  const queryKey = getQueryKey(trpc.gym.bootstrap, undefined, 'query');
  // `skipToken`: observe the cached entry without ever fetching (a key-only
  // query with no queryFn logs "No queryFn was passed" when React Query
  // touches it, e.g. on refocus).
  return useQuery<GymBootstrap>({ queryKey, queryFn: skipToken }).data;
}

/** Someone who trains: a gym profile with something on record. */
export function hasTraining(bootstrap: GymBootstrap | undefined): bootstrap is GymBootstrap {
  if (!bootstrap?.profile) return false;
  return bootstrap.recentSessions.length > 0 || bootstrap.weeks.length > 0;
}

export function StrengthTab({ range }: { range: StatsRangeDays }) {
  const bootstrap = useCachedGymBootstrap();
  if (!hasTraining(bootstrap)) return <StrengthEmpty />;
  return <StrengthBody bootstrap={bootstrap} range={range} />;
}

function StrengthEmpty() {
  const colors = useThemeColors();
  return (
    <BoardCard testID="stats-strength-empty" className="items-center gap-2 py-8">
      <Icon name="barbell" color={colors.brand} size={32} />
      <Text className="text-center text-headline font-semibold text-label">
        Your strength shows up here
      </Text>
      <Text className="text-center text-callout text-label-secondary">
        Log a workout and you&apos;ll see how often you train and how your lifts grow.
      </Text>
      <PressableScale
        testID="stats-strength-open-train"
        accessibilityRole="link"
        onPress={() => router.push('/train')}
        className="min-h-11 justify-center px-3"
      >
        <Text className="text-callout font-semibold text-brand">Go to Train</Text>
      </PressableScale>
    </BoardCard>
  );
}

function StrengthBody({ bootstrap, range }: { bootstrap: GymBootstrap; range: StatsRangeDays }) {
  const colors = useThemeColors();
  const online = useIsOnline();
  const today = localDate();
  const from = rangeStart(today, range);
  const beyondCache = needsOlderHistory(range);
  const year = range >= YEAR;

  // 3M: the next page of older sessions for an exact workout count. 1Y counts
  // workouts from the week summaries instead (every week since setup), so it
  // needs no session page. Both read new PRs from the server's PR timeline.
  const older = trpc.gym.session.list.useQuery(
    beyondCache && !year
      ? { cursor: olderHistoryCursor(bootstrap.recentSessions), limit: OLDER_PAGE }
      : skipToken,
    { staleTime: HISTORY_STALE_MS, retry: false },
  );
  const prTimeline = trpc.gym.stats.prs.useQuery(
    beyondCache ? { limit: PR_TIMELINE_LIMIT } : skipToken,
    { staleTime: HISTORY_STALE_MS, retry: false },
  );
  const stats = year
    ? prTimeline.data
      ? trainingStatsForYear({ bootstrap, prTimeline: prTimeline.data, today, rangeDays: range })
      : trainingStats(bootstrap, today, range)
    : beyondCache && older.data && prTimeline.data
      ? trainingStatsWithHistory({
          bootstrap,
          olderSessions: older.data.items,
          prTimeline: prTimeline.data,
          today,
          rangeDays: range,
        })
      : trainingStats(bootstrap, today, range);
  const suffix = stats.clipped ? ', last 12 weeks' : '';

  const localPrs = useMemo(
    () => collectPrs(bootstrap.recentSessions, undefined, bootstrap.olderBests),
    [bootstrap],
  );
  const prs = recentPrs(beyondCache ? (prTimeline.data ?? localPrs) : localPrs, from, today);

  // Sets per muscle: exact from the cached sessions up to 12 weeks; past that
  // the server's weekly totals (the cache's weeks while offline).
  // (Not use-gym-bootstrap's libraryLookup: importing that module builds the
  // gym query key at load, which this screen's module load must not do.)
  const lookup = useMemo(() => {
    const byId = new Map(bootstrap.library.map((e) => [e.id, e]));
    return (id: string) => byId.get(id);
  }, [bootstrap]);
  const volumeWeeks = Math.min(52, Math.ceil(range / 7));
  const apiVolume = trpc.gym.stats.muscleVolume.useQuery(
    beyondCache && online ? { weeks: volumeWeeks } : skipToken,
    { staleTime: HISTORY_STALE_MS, retry: false },
  );
  const localVolume = useMemo(
    () =>
      completedSetsByWeek(
        bootstrap.recentSessions.filter((s) => s.localDate >= from && s.localDate <= today),
        lookup,
      ),
    [bootstrap, from, today, lookup],
  );
  const volume: MuscleVolumeWeekDto[] = beyondCache ? (apiVolume.data ?? localVolume) : localVolume;
  const muscles = muscleSets(volume, range);

  // The lifts you train now: picked from the cached weeks (all of them past 12 weeks).
  const lifts = pickLifts(
    bootstrap.recentSessions,
    bootstrap.library,
    beyondCache ? rangeStart(today, BOOTSTRAP_SESSION_DAYS) : from,
    LIFTS,
  );
  const unit = bootstrap.profile?.unit ?? 'KG';
  const byId = new Map(bootstrap.library.map((e) => [e.id, e]));

  return (
    <View testID="stats-training" className="gap-4">
      <StatTiles>
        <StatTile
          testID="stats-workouts"
          icon={<Icon name="barbell" color={colors.brand} size={18} />}
          value={String(stats.workouts)}
          count={stats.workouts}
          label={`workouts${suffix}`}
        />
        <StatTile
          testID="stats-prs"
          icon={<Icon name="star" color={colors.brand} size={18} />}
          value={String(stats.newPrs)}
          count={stats.newPrs}
          label={`new PRs${suffix}`}
        />
        <StatTile
          testID="stats-streak"
          icon={<Icon name="flame" color={colors.brand} size={18} />}
          value={String(stats.streakWeeks)}
          count={stats.streakWeeks}
          label="week streak"
        />
      </StatTiles>

      <View className="gap-3">
        <SectionTitle>{range === 7 ? 'This week' : 'Workouts per week'}</SectionTitle>
        <BoardCard>
          {range === 7 ? (
            <ThisWeek bootstrap={bootstrap} today={today} />
          ) : (
            <WeeksChart bootstrap={bootstrap} from={from} today={today} />
          )}
        </BoardCard>
      </View>

      <View className="gap-3">
        <SectionTitle>Your lifts</SectionTitle>
        <BoardCard testID="stats-lifts">
          {lifts.length === 0 ? (
            <Text className="text-callout text-label-secondary">
              Log a weighted exercise to see your best sets here.
            </Text>
          ) : (
            lifts.map((lift) => (
              <LiftRow
                key={lift.id}
                lift={lift}
                bootstrap={bootstrap}
                range={range}
                from={from}
                today={today}
                unit={unit}
                online={online}
              />
            ))
          )}
          <Text className="text-caption text-label-secondary">
            Stronger compares your best sets at the start and the end of the range.
          </Text>
        </BoardCard>
      </View>

      <View className="gap-3">
        <SectionTitle>Sets per muscle</SectionTitle>
        <BoardCard testID="stats-muscles">
          {muscles.length === 0 ? (
            <Text className="text-callout text-label-secondary">
              No working sets in this range yet.
            </Text>
          ) : (
            muscles.map((m) => (
              <View
                key={m.group}
                testID={`stats-muscle-${m.group}`}
                accessible
                accessibilityLabel={`${VOLUME_GROUP_LABELS[m.group]}: ${m.sets} ${m.sets === 1 ? 'set' : 'sets'}${range > 7 ? ' a week' : ''}`}
                className="gap-1.5"
              >
                <View className="flex-row items-baseline justify-between gap-3">
                  <Text className="min-w-0 flex-1 text-callout text-label">
                    {VOLUME_GROUP_LABELS[m.group]}
                  </Text>
                  <Text className="text-callout font-semibold text-label">{String(m.sets)}</Text>
                </View>
                <ProgressBar
                  progress={m.sets / (muscles[0]?.sets ?? 1)}
                  color={colors.brand}
                  className="h-2 bg-surface-sunken"
                />
              </View>
            ))
          )}
          <Text className="text-caption text-label-secondary">
            {range > 7 ? 'Working sets a week, on average' : 'Working sets in the last 7 days'}
          </Text>
        </BoardCard>
      </View>

      <View className="gap-3">
        <SectionTitle>Recent PRs</SectionTitle>
        <BoardCard testID="stats-recent-prs">
          {prs.length === 0 ? (
            <Text className="text-callout text-label-secondary">
              No new PRs in this range yet. They&apos;ll show up here as you beat your best sets.
            </Text>
          ) : (
            prs.map((pr) => (
              <PrRow
                key={`${pr.sessionId}:${pr.exerciseId}`}
                pr={pr}
                name={byId.get(pr.exerciseId)?.name}
                unit={unit}
              />
            ))
          )}
        </BoardCard>
      </View>

      <CardLink
        testID="stats-strength"
        label="All charts and history"
        onPress={() => router.push('/training/stats')}
      />
    </View>
  );
}

function ThisWeek({ bootstrap, today }: { bootstrap: GymBootstrap; today: string }) {
  const colors = useThemeColors();
  const days = thisWeekDays(bootstrap.recentSessions, today);
  const done = days.filter((d) => d.trained).length;
  const goal = bootstrap.streak.thisWeekGoal;
  return (
    <View testID="stats-this-week" className="gap-3">
      <Text className="text-callout text-label">
        {goal > 0 ? `${done} of ${goal} workouts this week` : `${done} workouts this week`}
      </Text>
      <View className="flex-row justify-between">
        {days.map((d, i) => (
          <View
            key={d.date}
            accessible
            accessibilityLabel={`${shortDate(d.date)}: ${d.trained ? 'trained' : d.future ? 'still to come' : 'rest'}`}
            className="items-center gap-1"
          >
            <View
              className={
                d.trained
                  ? 'h-9 w-9 items-center justify-center rounded-full bg-brand'
                  : d.isToday
                    ? 'h-9 w-9 items-center justify-center rounded-full border-2 border-brand'
                    : 'h-9 w-9 items-center justify-center rounded-full border border-separator'
              }
            >
              {d.trained ? <Icon name="checkmark" color={colors.onBrand} size={16} /> : null}
            </View>
            <Text className="text-caption text-label-secondary">{WEEKDAY_INITIALS[i]}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function WeeksChart({
  bootstrap,
  from,
  today,
}: {
  bootstrap: GymBootstrap;
  from: string;
  today: string;
}) {
  const colors = useThemeColors();
  const bars = workoutWeekBars(bootstrap.weeks, from, today);
  const met = bars.filter((b) => b.met).length;
  if (bars.length === 0) {
    return (
      <Text className="text-callout text-label-secondary">No workouts in this range yet.</Text>
    );
  }
  return (
    <View testID="stats-weeks" className="gap-2">
      <BarChart
        testID="stats-weeks-chart"
        accessibilityLabel={`Workouts per week: goal met in ${met} of ${bars.length} weeks`}
        data={bars.map((b) => ({
          label: shortDate(b.weekStart),
          segments: [{ key: b.met ? 'met' : 'under', value: b.sessions }],
        }))}
        seriesColors={{ met: colors.brand, under: colors.labelTertiary }}
        labelEvery={Math.max(1, Math.ceil(bars.length / 3))}
        height={140}
      />
      <View className="flex-row flex-wrap items-center gap-x-4 gap-y-1">
        <Legend color={colors.brand} label="Goal met" />
        <Legend color={colors.labelTertiary} label="Below goal" />
        <Text className="ml-auto text-caption text-label-secondary">
          {`Goal met ${met} of ${bars.length} ${bars.length === 1 ? 'week' : 'weeks'}`}
        </Text>
      </View>
    </View>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View className="flex-row items-center gap-1.5">
      <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      <Text className="text-caption text-label-secondary">{label}</Text>
    </View>
  );
}

function LiftRow({
  lift,
  bootstrap,
  range,
  from,
  today,
  unit,
  online,
}: {
  lift: ExerciseDto;
  bootstrap: GymBootstrap;
  range: StatsRangeDays;
  from: string;
  today: string;
  unit: 'KG' | 'LB';
  online: boolean;
}) {
  const colors = useThemeColors();
  const beyondCache = needsOlderHistory(range);
  const api = trpc.gym.stats.e1rm.useQuery(
    beyondCache && online ? { exerciseId: lift.id, range: '1y' } : skipToken,
    { staleTime: HISTORY_STALE_MS, retry: false },
  );
  const local = useMemo(
    () => localE1rmSeries(bootstrap.recentSessions, lift.id, bootstrap.olderBests),
    [bootstrap, lift.id],
  );
  const summary = liftSummary(api.data ?? local, from, today);
  if (!summary.best) return null;
  const change = liftChangeText(summary.changePct);
  const best = `${formatLoad(summary.best.weightKg, unit)} × ${summary.best.reps}`;
  const up = (summary.changePct ?? 0) >= 1;
  return (
    <View
      testID={`stats-lift-${lift.id}`}
      accessible
      accessibilityLabel={`${lift.name}: best set ${best}${change ? `, ${change}` : ''}`}
      className="flex-row items-center gap-3 border-b border-separator pb-3"
    >
      <View className="min-w-0 flex-1 gap-0.5">
        <Text numberOfLines={1} className="text-callout font-semibold text-label">
          {lift.name}
        </Text>
        <Text className="text-subhead text-label-secondary">{`Best ${best}`}</Text>
        {change ? (
          <Text
            className={
              up ? 'text-subhead font-semibold text-positive' : 'text-subhead text-label-secondary'
            }
          >
            {change}
          </Text>
        ) : null}
      </View>
      <Sparkline values={summary.points} color={up ? colors.positive : colors.brand} />
    </View>
  );
}

/** Monday first, as the week strip runs. */
const WEEKDAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const SPARK_W = 72;
const SPARK_H = 28;

/** A tiny unlabelled trend: where the lift went over the range, nothing to decode. */
function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return <View style={{ width: SPARK_W }} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * (SPARK_W - 4) + 2;
      const y = SPARK_H - 2 - ((v - min) / span) * (SPARK_H - 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <Svg
      width={SPARK_W}
      height={SPARK_H}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </Svg>
  );
}

function PrRow({
  pr,
  name,
  unit,
}: {
  pr: PersonalRecord;
  name: string | undefined;
  unit: 'KG' | 'LB';
}) {
  const colors = useThemeColors();
  const set = `${formatLoad(pr.weightKg, unit)} × ${pr.reps}`;
  const label = name ?? 'Exercise';
  return (
    <View
      testID="stats-pr-row"
      accessible
      accessibilityLabel={`New PR on ${shortDate(pr.localDate)}: ${label}, ${set}`}
      className="flex-row items-center gap-3"
    >
      <View className="h-8 w-8 items-center justify-center rounded-full bg-brand-tint">
        <Icon name="star" color={colors.brand} size={16} />
      </View>
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="text-callout font-semibold text-label">
          {label}
        </Text>
        <Text className="text-subhead text-label-secondary">{set}</Text>
      </View>
      <Text className="text-caption text-label-secondary">{shortDate(pr.localDate)}</Text>
    </View>
  );
}
