import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import type { ExerciseDto, PersonalRecord, StreakInfo } from '@chefer/types';
import {
  Button,
  EmptyState,
  PressableScale,
  ProgressRing,
  Screen,
  StatTile,
  StatTiles,
  Text,
  useThemeColors,
} from '@chefer/ui-mobile';
import {
  cn,
  estimateSessionKcal,
  formatDate,
  formatLoad,
  localDateStr,
  postWorkoutProteinG,
  sessionKcalCopy,
} from '@chefer/utils';
import { Icon } from '../../../components/icon';
import { trpc } from '../../../lib/trpc';
import { ExerciseNameLink } from '../../gym/components/exercise-name-link';
import { formatStreakLine } from '../../gym/today/today-helpers';
import { useGymBootstrap } from '../../gym/use-gym-bootstrap';
import { getFinished } from '../../gym/workout/finished-store';
import {
  nextTimeRows,
  sessionPrs,
  summaryFromDoc,
  summaryFromRecent,
  type NextTimeRow,
} from '../../gym/workout/summary-model';
import { AdjustSheet, goToday, PR_KIND_LABEL } from '../../gym/workout/summary-screen';
import { useIsOnline } from '../../gym/workout/use-is-online';
import { DIRECTION_LABEL, fallbackMeta, unitOf } from '../../gym/workout/workout-model';
import { BurnTile } from './burn-tile';

// ─── Workout summary, shell v2 (10 Oct redesign, Summary board) ─────────────
// Same data as the legacy SummaryScreen (finished-store doc or the cached
// recentSessions copy, PRs against cached history, the engine's "Next time"
// from the optimistically folded bootstrap — correct offline too), laid out
// as the board: trophy hero, three stat tiles, PR card, week ring, refuel
// row, compact Next-time rows, Done. The middle tile is calories burned —
// the user's logged kcal, else `estimateSessionKcal` from the bootstrap's
// bodyweight and the workout time ("~310 kcal burned (est.)") — and Sets
// only when neither exists (no weigh-in and nothing logged).

/** Duration tile: "52" + "min", or "1:05" + "h" from an hour on. */
function durationTile(sec: number | null): { value: string; unit?: string } {
  if (sec === null) return { value: '—' };
  const min = Math.max(0, Math.round(sec / 60));
  if (min < 60) return { value: String(min), unit: 'min' };
  return { value: `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`, unit: 'h' };
}

/** Same copy as the legacy summary's streak line. */
function streakLine(streak: StreakInfo): string {
  if (streak.current > 0) return formatStreakLine(streak);
  const goal = streak.thisWeekGoal;
  const sessions = streak.thisWeekSessions;
  return sessions >= goal && goal > 0
    ? 'Weekly goal met. Your streak starts now.'
    : `${Math.max(0, goal - sessions)} more this week to meet your goal.`;
}

export function WorkoutSummaryV2({ id }: { id: string }) {
  const colors = useThemeColors();
  const { data: bootstrap } = useGymBootstrap();
  const online = useIsOnline();
  const unit = unitOf(bootstrap);
  const [adjusting, setAdjusting] = useState<NextTimeRow | null>(null);
  const [adjustKey, setAdjustKey] = useState(0);

  const view = useMemo(() => {
    const doc = getFinished(id);
    if (doc) return summaryFromDoc(doc);
    const recent = bootstrap?.recentSessions.find((s) => s.id === id);
    return recent ? summaryFromRecent(recent) : null;
  }, [id, bootstrap?.recentSessions]);

  const lookup = useMemo(() => {
    const byId = new Map<string, ExerciseDto>((bootstrap?.library ?? []).map((e) => [e.id, e]));
    return (exerciseId: string) => byId.get(exerciseId) ?? fallbackMeta(exerciseId);
  }, [bootstrap?.library]);

  const prs = useMemo(
    () => (view ? sessionPrs(view, bootstrap?.recentSessions ?? [], bootstrap?.olderBests) : []),
    [view, bootstrap?.recentSessions, bootstrap?.olderBests],
  );
  const rows = useMemo(() => (view ? nextTimeRows(view, bootstrap) : []), [view, bootstrap]);

  if (!view) {
    return (
      <Screen className="bg-canvas" edges={['top', 'bottom', 'left', 'right']}>
        <EmptyState
          testID="summary-missing"
          title="Workout saved"
          description="It will sync as soon as you have a connection."
          action={{ label: 'Done', onPress: goToday, testID: 'summary-done' }}
        />
      </Screen>
    );
  }

  const burn = estimateSessionKcal({
    session: view.summary,
    bodyweightKg: bootstrap?.bodyweightKg,
  });
  const duration = durationTile(view.durationSec);
  const exerciseCount = view.exercises.filter((e) => !e.skipped && e.workingSets > 0).length;
  const day = formatDate(`${view.summary.localDate}T00:00:00Z`, 'weekday-short', {
    timeZone: 'UTC',
  });
  const streak = bootstrap?.streak;
  const loadOf = (exerciseId: string, weightKg: number) => {
    const meta = lookup(exerciseId);
    return formatLoad(weightKg, unit, meta.loadType, { each: meta.perHand });
  };

  return (
    <Screen className="bg-canvas px-0" edges={['top', 'bottom', 'left', 'right']}>
      <ScrollView testID="summary-scroll" contentContainerClassName="gap-4 px-4 pb-8 pt-6">
        <View className="items-center gap-2">
          {/* Decorative: the title says it. */}
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            className="h-20 w-20 items-center justify-center rounded-full bg-brand-tint"
          >
            <Text className="text-display">🏆</Text>
          </View>
          <Text
            testID="summary-title"
            accessibilityRole="header"
            className="text-center text-title1 font-bold text-label"
          >
            Workout complete
          </Text>
          <Text
            testID="summary-subline"
            numberOfLines={2}
            className="text-center text-subhead text-label-secondary"
          >
            {day ? `${view.name} · ${day}` : view.name}
          </Text>
        </View>

        <StatTiles>
          <StatTile
            testID="summary-duration"
            icon={<Icon name="time" size={18} color={colors.brand} />}
            value={duration.value}
            unit={duration.unit}
            label="Duration"
          />
          {burn ? (
            <BurnTile testID="summary-kcal" copy={sessionKcalCopy(burn)} />
          ) : (
            <StatTile
              testID="summary-sets"
              icon={<Icon name="barbell" size={18} color={colors.brand} />}
              value={String(view.workingSets)}
              label={view.workingSets === 1 ? 'Set' : 'Sets'}
            />
          )}
          <StatTile
            testID="summary-exercises"
            icon={<Icon name="list" size={18} color={colors.brand} />}
            value={String(exerciseCount)}
            label={exerciseCount === 1 ? 'Exercise' : 'Exercises'}
          />
        </StatTiles>

        {prs.length > 0 ? (
          <PrCard prs={prs} nameOf={(exerciseId) => lookup(exerciseId).name} loadOf={loadOf} />
        ) : null}

        {streak ? (
          <View className="flex-row items-center gap-4 rounded-card border border-separator bg-surface p-4">
            <ProgressRing
              testID="summary-week-ring"
              progress={streak.thisWeekGoal > 0 ? streak.thisWeekSessions / streak.thisWeekGoal : 0}
              size={56}
              color={colors.brand}
              trackColor={colors.surfaceSunken}
              accessibilityLabel={`${streak.thisWeekSessions} of ${streak.thisWeekGoal} workouts this week`}
            >
              <Text className="text-subhead font-bold text-label">
                {streak.thisWeekSessions}/{streak.thisWeekGoal}
              </Text>
            </ProgressRing>
            <View className="min-w-0 flex-1">
              <Text testID="summary-week" className="text-headline font-semibold text-label">
                {streak.thisWeekSessions} of {streak.thisWeekGoal} this week
              </Text>
              <Text testID="summary-streak" className="text-subhead text-label-secondary">
                {streakLine(streak)}
              </Text>
            </View>
          </View>
        ) : null}

        <RefuelRow bodyweightKg={bootstrap?.bodyweightKg ?? null} />

        <View className="gap-2">
          <Text
            testID="summary-next-time"
            accessibilityRole="header"
            className="pt-2 text-title3 font-bold text-label"
          >
            Next time
          </Text>
          {rows.length === 0 ? (
            <Text className="text-subhead text-label-secondary">
              Your next targets appear here once this workout syncs.
            </Text>
          ) : null}
          {!online && rows.length > 0 ? (
            <Text testID="summary-offline" className="text-caption text-label-secondary">
              Adjusting targets needs a connection. Your workout is saved and will sync.
            </Text>
          ) : null}
          {rows.length > 0 ? (
            <View className="overflow-hidden rounded-card border border-separator bg-surface">
              {rows.map((row, i) => {
                const meta = lookup(row.exerciseId);
                const s = row.progression.suggestion;
                return (
                  <View
                    key={row.exerciseId}
                    testID={`summary-next-${i}`}
                    className={cn(
                      'min-h-11 flex-row items-center gap-3 py-2.5 pl-4 pr-2',
                      i > 0 && 'border-t border-separator',
                    )}
                  >
                    <DirectionDot index={i} direction={row.direction} />
                    <View className="min-w-0 flex-1">
                      <ExerciseNameLink
                        testID={`summary-next-${i}-name`}
                        exerciseId={row.exerciseId}
                        name={meta.name}
                        numberOfLines={1}
                        textClassName="text-callout font-semibold text-label"
                      />
                      <Text
                        testID={`summary-next-${i}-target`}
                        accessibilityHint={row.sentence}
                        className="text-subhead text-label-secondary"
                      >
                        {loadOf(row.exerciseId, s.weightKg)} × {s.reps.join(' / ')}
                        {meta.isTimed ? ' s' : ''}
                      </Text>
                    </View>
                    {/* MO-01: press feedback on the ghost Adjust control. */}
                    <PressableScale
                      testID={`summary-next-${i}-adjust`}
                      accessibilityRole="button"
                      accessibilityLabel={`Adjust next target for ${meta.name}`}
                      accessibilityHint={row.sentence}
                      accessibilityState={{ disabled: !online }}
                      disabled={!online}
                      onPress={() => {
                        setAdjusting(row);
                        setAdjustKey((k) => k + 1);
                      }}
                      className={cn(
                        'min-h-11 justify-center rounded-control px-3',
                        !online && 'opacity-40',
                      )}
                    >
                      <Text className="text-callout font-semibold text-brand">Adjust</Text>
                    </PressableScale>
                  </View>
                );
              })}
            </View>
          ) : null}
        </View>

        {bootstrap?.nextWorkout ? (
          <Text testID="summary-next-up" className="text-subhead text-label-secondary">
            Next up: {bootstrap.nextWorkout.dayName}
          </Text>
        ) : null}

        <Button testID="summary-done" size="lg" className="w-full" onPress={goToday}>
          Done
        </Button>
      </ScrollView>

      {adjusting ? (
        <AdjustSheet
          key={adjustKey}
          row={adjusting}
          meta={lookup(adjusting.exerciseId)}
          bootstrap={bootstrap}
          reason={adjusting.sentence}
          onClose={() => setAdjusting(null)}
        />
      ) : null}
    </Screen>
  );
}

/** Round "going up / same / going down" marker; the label is spoken, never just the glyph. */
function DirectionDot({
  index,
  direction,
}: {
  index: number;
  direction: NextTimeRow['direction'];
}) {
  const colors = useThemeColors();
  return (
    <View
      testID={`summary-next-${index}-direction`}
      accessible
      accessibilityRole="image"
      accessibilityLabel={DIRECTION_LABEL[direction]}
      className={cn(
        'h-8 w-8 items-center justify-center rounded-full',
        direction === 'up'
          ? 'bg-positive/10'
          : direction === 'down'
            ? 'bg-attention/10'
            : 'bg-surface-sunken',
      )}
    >
      {direction === 'up' ? (
        <Icon name="arrowUp" size={16} color={colors.positive} />
      ) : direction === 'down' ? (
        <Icon name="trendDown" size={16} color={colors.attention} />
      ) : (
        <Text className="text-callout font-bold text-label-secondary">=</Text>
      )}
    </View>
  );
}

function PrCard({
  prs,
  nameOf,
  loadOf,
}: {
  prs: readonly PersonalRecord[];
  nameOf: (exerciseId: string) => string;
  loadOf: (exerciseId: string, weightKg: number) => string;
}) {
  const colors = useThemeColors();
  const single = prs.length === 1;
  return (
    <View testID="summary-prs" className="gap-3 rounded-card bg-brand-tint p-4">
      {single ? null : (
        <Text accessibilityRole="header" className="text-headline font-semibold text-label">
          {prs.length} new PRs
        </Text>
      )}
      {prs.map((pr) => {
        const name = nameOf(pr.exerciseId);
        return (
          <View
            key={`${pr.exerciseId}-${pr.kind}`}
            testID={`summary-pr-${pr.exerciseId}`}
            className="flex-row items-center gap-3"
          >
            <Icon name="trophy" size={22} color={colors.brand} />
            <View className="min-w-0 flex-1">
              <ExerciseNameLink
                testID={`summary-pr-${pr.exerciseId}-name`}
                exerciseId={pr.exerciseId}
                name={single ? `New PR · ${name}` : name}
                textClassName="text-headline font-semibold text-label"
              />
              <Text className="text-subhead text-label-secondary">
                {loadOf(pr.exerciseId, pr.weightKg)} × {pr.reps} · {PR_KIND_LABEL[pr.kind]}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

/**
 * Post-workout refuel nudge (audit P2-4, every tier) as one row: the protein
 * to aim for (~0.4 g/kg) and the next planned meal — offline or without a
 * plan, the tracker. Same query and destinations as the legacy RefuelCard.
 */
function RefuelRow({ bodyweightKg }: { bodyweightKg: number | null }) {
  const colors = useThemeColors();
  const grams = postWorkoutProteinG(bodyweightKg);
  const { data } = trpc.dashboard.summary.useQuery(
    { localDate: localDateStr(), localHour: new Date().getHours() },
    { retry: false, staleTime: 60_000 },
  );
  const next = data?.nextMeal ?? data?.tomorrowFirstMeal ?? null;
  const title = next ? next.recipe.name : 'Log a meal in the tracker';
  return (
    <View testID="summary-refuel">
      {/* MO-01 card press. */}
      <PressableScale
        testID="summary-refuel-link"
        pressScale="card"
        accessibilityRole="link"
        accessibilityLabel={`Next meal, aim for about ${grams} g protein: ${title}`}
        accessibilityHint={`It helps your muscles recover from this session. ${
          next ? 'Opens the recipe.' : 'Opens the tracker.'
        }`}
        onPress={() => router.push(next ? `/recipe/${next.recipe.id}` : '/tracker')}
        className="min-h-11 flex-row items-center gap-3 rounded-card border border-separator bg-surface p-4"
      >
        <Icon name="cook" size={20} color={colors.brand} />
        <View className="min-w-0 flex-1">
          <Text testID="summary-refuel-grams" className="text-caption text-label-secondary">
            Next meal · aim for ~{grams} g protein
          </Text>
          <Text numberOfLines={1} className="text-headline font-semibold text-label">
            {title}
          </Text>
        </View>
        <Icon name="chevronRight" size={18} color={colors.labelTertiary} />
      </PressableScale>
    </View>
  );
}
