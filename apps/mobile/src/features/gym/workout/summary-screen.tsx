import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import type { ExerciseDto, GymBootstrap, ProgressionDto } from '@chefer/types';
import {
  Button,
  Card,
  EmptyState,
  ProgressRing,
  Screen,
  Sheet,
  Text,
  useThemeColors,
} from '@chefer/ui-mobile';
import { cn, formatLoad, localDateStr, postWorkoutProteinG } from '@chefer/utils';
import { getTranslator, useT } from '../../../lib/i18n';
import { trpc } from '../../../lib/trpc';
import { useWorkoutReviewPrompt } from '../../review/review-signals';
import { ExerciseNameLink } from '../components/exercise-name-link';
import { gymBootstrapQueryKey, useGymBootstrap } from '../use-gym-bootstrap';
import { getFinished } from './finished-store';
import {
  nextTimeRows,
  sessionPrs,
  streakLineText,
  summaryFromDoc,
  summaryFromRecent,
  type NextTimeRow,
} from './summary-model';
import { TargetFields, TargetKeypad, type TargetEditing } from './target-fields';
import { useIsOnline } from './use-is-online';
import {
  DIRECTION_ICON,
  directionLabel,
  equipmentOf,
  fallbackMeta,
  formatDuration,
  unitOf,
} from './workout-model';

// Finish screen (gym_plan.md §1.1: the loop closes here). Shows what the
// engine decided for next time right away, from the optimistically folded
// cached bootstrap — so it is correct offline too.

/** The PR kind's label, in the UI language at call time. */
export const prKindLabel = (kind: 'e1rm' | 'weight' | 'reps'): string =>
  getTranslator().t(`gym.summary.prKindLong.${kind}`);

export function goToday(): void {
  if (router.canDismiss()) router.dismissTo('/today');
  else router.replace('/today');
}

export function SummaryScreen({ id }: { id: string }) {
  const { t } = useT();
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
  // Store rating prompt (ASO §5.1): a PR or the 3rd workout, once the summary has played.
  useWorkoutReviewPrompt(id, getFinished(id) !== undefined, prs.length);
  const rows = useMemo(() => (view ? nextTimeRows(view, bootstrap) : []), [view, bootstrap]);

  if (!view) {
    return (
      <Screen edges={['top', 'bottom', 'left', 'right']}>
        <EmptyState
          testID="summary-missing"
          title={t('gym.summary.savedTitle')}
          description={t('gym.summary.savedBody')}
          action={{ label: t('common.actions.done'), onPress: goToday, testID: 'summary-done' }}
        />
      </Screen>
    );
  }

  const streak = bootstrap?.streak;
  const goal = streak?.thisWeekGoal ?? 0;
  const sessions = streak?.thisWeekSessions ?? 0;
  const streakLine = streak ? streakLineText(streak, t) : null;

  return (
    <Screen className="px-0" edges={['top', 'bottom', 'left', 'right']}>
      <ScrollView contentContainerClassName="gap-4 px-4 py-4">
        <View>
          <Text variant="muted">{view.name}</Text>
          <Text testID="summary-title" variant="title">
            {t('gym.summary.workoutDone')}
          </Text>
        </View>

        <View className="flex-row gap-2">
          <Stat
            testID="summary-duration"
            label={t('gym.summary.duration')}
            value={view.durationSec === null ? '—' : formatDuration(view.durationSec)}
          />
          <Stat
            testID="summary-sets"
            label={t('gym.summary.stats.sets')}
            value={String(view.workingSets)}
          />
          <Stat
            testID="summary-prs"
            label={t('gym.summary.stats.prs')}
            value={String(prs.length)}
          />
        </View>

        {streak ? (
          <Card className="flex-row items-center gap-4">
            <ProgressRing
              testID="summary-week-ring"
              progress={goal > 0 ? sessions / goal : 0}
              size={72}
              accessibilityLabel={t('gym.summary.workoutsThisWeek', { done: sessions, goal })}
            >
              <Text className="text-base font-bold">
                {sessions}/{goal}
              </Text>
            </ProgressRing>
            <View className="min-w-0 flex-1">
              <Text testID="summary-week" className="text-base font-semibold">
                {t('gym.summary.weekProgress', { done: sessions, goal })}
              </Text>
              {streakLine ? (
                <Text testID="summary-streak" variant="muted">
                  {streakLine}
                </Text>
              ) : null}
            </View>
          </Card>
        ) : null}

        <RefuelCard bodyweightKg={bootstrap?.bodyweightKg ?? null} />

        {prs.length > 0 ? (
          <View className="gap-2">
            <Text variant="heading">{t('gym.summary.personalRecords')}</Text>
            {prs.map((pr) => {
              const meta = lookup(pr.exerciseId);
              return (
                <View
                  key={`${pr.exerciseId}-${pr.kind}`}
                  testID={`summary-pr-${pr.exerciseId}`}
                  className="flex-row items-center gap-3 rounded-xl bg-brand-tint px-3 py-2"
                >
                  <Text className="text-lg">🏆</Text>
                  <View className="min-w-0 flex-1">
                    <ExerciseNameLink
                      testID={`summary-pr-${pr.exerciseId}-name`}
                      exerciseId={pr.exerciseId}
                      name={meta.name}
                      textClassName="font-semibold"
                    />
                    <Text variant="muted">
                      {prKindLabel(pr.kind)} ·{' '}
                      {formatLoad(pr.weightKg, unit, meta.loadType, { each: meta.perHand })} ×{' '}
                      {pr.reps}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}

        <View className="gap-2">
          <Text testID="summary-next-time" variant="heading">
            {t('gym.summary.nextTime')}
          </Text>
          {rows.length === 0 ? (
            <Text variant="muted">{t('gym.summary.targetsPending')}</Text>
          ) : null}
          {!online && rows.length > 0 ? (
            <Text testID="summary-offline" variant="muted" className="text-xs">
              {t('gym.summary.offlineAdjust')}
            </Text>
          ) : null}
          {rows.map((row, i) => {
            const meta = lookup(row.exerciseId);
            const s = row.progression.suggestion;
            return (
              <View
                key={row.exerciseId}
                testID={`summary-next-${i}`}
                className="gap-1 rounded-xl border border-border bg-card p-3"
              >
                <View className="flex-row items-center gap-2">
                  <View
                    className={cn(
                      'h-8 w-8 items-center justify-center rounded-full',
                      row.direction === 'up'
                        ? 'bg-positive/10'
                        : row.direction === 'down'
                          ? 'bg-attention/10'
                          : 'bg-muted',
                    )}
                  >
                    <Text
                      testID={`summary-next-${i}-direction`}
                      accessibilityLabel={directionLabel(row.direction)}
                      className="text-base font-bold"
                    >
                      {DIRECTION_ICON[row.direction]}
                    </Text>
                  </View>
                  <View className="min-w-0 flex-1">
                    <ExerciseNameLink
                      testID={`summary-next-${i}-name`}
                      exerciseId={row.exerciseId}
                      name={meta.name}
                      numberOfLines={1}
                      textClassName="font-semibold"
                    />
                    <Text testID={`summary-next-${i}-target`} variant="muted">
                      {formatLoad(s.weightKg, unit, meta.loadType, { each: meta.perHand })} ×{' '}
                      {s.reps.join(' / ')}
                      {meta.isTimed ? ` ${t('gym.workout.logger.setRow.secondsUnit')}` : ''}
                    </Text>
                  </View>
                  <Pressable
                    testID={`summary-next-${i}-adjust`}
                    accessibilityRole="button"
                    accessibilityLabel={t('gym.summary.adjustA11y', { name: meta.name })}
                    accessibilityState={{ disabled: !online }}
                    disabled={!online}
                    onPress={() => {
                      setAdjusting(row);
                      setAdjustKey((k) => k + 1);
                    }}
                    className={cn(
                      'min-h-11 justify-center rounded-lg px-3',
                      online ? 'bg-muted active:opacity-70' : 'opacity-40',
                    )}
                  >
                    <Text className="text-sm font-semibold text-primary">
                      {t('gym.summary.adjust')}
                    </Text>
                  </Pressable>
                </View>
                <Text testID={`summary-next-${i}-reason`} className="text-sm">
                  {row.sentence}
                </Text>
              </View>
            );
          })}
        </View>

        {bootstrap?.nextWorkout ? (
          <Text testID="summary-next-up" variant="muted">
            {t('gym.summary.refuelNext', { name: bootstrap.nextWorkout.dayName })}
          </Text>
        ) : null}

        <Button testID="summary-done" size="lg" onPress={goToday}>
          {t('common.actions.done')}
        </Button>
      </ScrollView>

      {adjusting ? (
        <AdjustSheet
          key={adjustKey}
          row={adjusting}
          meta={lookup(adjusting.exerciseId)}
          bootstrap={bootstrap}
          onClose={() => setAdjusting(null)}
        />
      ) : null}
    </Screen>
  );
}

/**
 * Post-workout nudge (audit P2-4, every tier; mirrors web's RefuelCard): the
 * protein to aim for in the next meal (~0.4 g/kg), with the next planned meal
 * when the food plan loads — offline or without a plan, quick add instead.
 */
function RefuelCard({ bodyweightKg }: { bodyweightKg: number | null }) {
  const colors = useThemeColors();
  const { t } = useT();
  const grams = postWorkoutProteinG(bodyweightKg);
  const { data } = trpc.dashboard.summary.useQuery(
    { localDate: localDateStr(), localHour: new Date().getHours() },
    { retry: false, staleTime: 60_000 },
  );
  const next = data?.nextMeal ?? data?.tomorrowFirstMeal ?? null;
  return (
    <Card testID="summary-refuel" className="gap-1">
      <View className="flex-row items-center gap-2">
        <Ionicons name="restaurant-outline" size={18} color={colors.brand} />
        <Text testID="summary-refuel-grams" className="min-w-0 flex-1 text-base font-semibold">
          {t('gym.summary.refuelAim', { grams })}
        </Text>
      </View>
      <Text variant="muted" className="text-sm">
        {t('gym.summary.refuelHelp')}
      </Text>
      <Pressable
        testID="summary-refuel-link"
        accessibilityRole="link"
        onPress={() => router.push(next ? `/recipe/${next.recipe.id}` : '/tracker')}
        className="min-h-11 justify-center"
      >
        <Text numberOfLines={1} className="text-sm font-semibold text-primary">
          {next
            ? t('gym.summary.refuelNextArrow', { name: next.recipe.name })
            : t('gym.summary.refuelLogArrow')}
        </Text>
      </Pressable>
    </Card>
  );
}

function Stat({ testID, label, value }: { testID: string; label: string; value: string }) {
  return (
    <View className="min-w-0 flex-1 rounded-xl bg-muted px-3 py-2">
      <Text variant="muted" className="text-xs">
        {label}
      </Text>
      <Text testID={testID} numberOfLines={1} className="text-lg font-bold">
        {value}
      </Text>
    </View>
  );
}

/** Patch one progression (and the matching next-workout slot) in the cached bootstrap. */
function patchProgression(old: GymBootstrap | undefined, dto: ProgressionDto) {
  if (!old) return old;
  const matches = (p: { exerciseId: string; repBucket: string }) =>
    p.exerciseId === dto.exerciseId && p.repBucket === dto.repBucket;
  return {
    ...old,
    // Keep the local state (it may already include a not-yet-synced session);
    // take the server's override and resulting suggestion.
    progressions: old.progressions.map((p) =>
      matches(p) ? { ...p, override: dto.override, suggestion: dto.suggestion } : p,
    ),
    nextWorkout: old.nextWorkout
      ? {
          ...old.nextWorkout,
          exercises: old.nextWorkout.exercises.map((e) =>
            matches(e) ? { ...e, suggestion: dto.suggestion, sets: dto.suggestion.sets } : e,
          ),
        }
      : null,
  };
}

export function AdjustSheet({
  row,
  meta,
  bootstrap,
  onClose,
  reason,
}: {
  row: NextTimeRow;
  meta: ExerciseDto;
  bootstrap: GymBootstrap | undefined;
  onClose: () => void;
  /**
   * The engine's "why" sentence, shown above the fields. Only the shell-v2
   * summary passes it (its rows are compact); the legacy summary shows the
   * sentence on the row instead, so it leaves this out.
   */
  reason?: string;
}) {
  const { t } = useT();
  const queryClient = useQueryClient();
  const online = useIsOnline();
  const unit = unitOf(bootstrap);
  const profile = useMemo(() => equipmentOf(bootstrap), [bootstrap]);
  const s = row.progression.suggestion;
  const firstRep = s.reps[0] ?? 1;
  const [weightKg, setWeightKg] = useState(s.weightKg);
  const [repsFirst, setRepsFirst] = useState(firstRep);
  const [error, setError] = useState<string | null>(null);
  // T-05.4 (CI-31) / UX-GYM-28: the weight/reps fields — with typed entry through
  // the live logger's keypad — are the shared TargetFields (also the Routine tab's sheet).
  const [editing, setEditing] = useState<TargetEditing>(null);
  const reps = s.reps.map((r) => Math.max(1, r + (repsFirst - firstRep)));
  // The sheet shows its own error line — no default snackbar.
  const mutation = trpc.gym.progression.setOverride.useMutation({ meta: { silent: true } });

  const save = () => {
    setError(null);
    mutation.mutate(
      {
        exerciseId: row.progression.exerciseId,
        repBucket: row.progression.repBucket,
        weightKg,
        reps,
      },
      {
        onSuccess: (dto) => {
          queryClient.setQueryData<GymBootstrap>(gymBootstrapQueryKey, (old) =>
            patchProgression(old, dto),
          );
          void queryClient.invalidateQueries({ queryKey: gymBootstrapQueryKey });
          onClose();
        },
        onError: () => setError(t('gym.summary.adjustSaveError')),
      },
    );
  };

  return (
    <>
      <Sheet
        visible
        onClose={onClose}
        title={meta.name}
        eyebrow={t('gym.summary.nextTime')}
        testID="adjust-sheet"
        footer={
          <Button
            testID="adjust-sheet-save"
            size="lg"
            loading={mutation.isPending}
            disabled={!online}
            onPress={save}
          >
            {t('gym.summary.saveTarget')}
          </Button>
        }
      >
        {reason ? (
          <Text testID="adjust-sheet-reason" className="text-sm">
            {reason}
          </Text>
        ) : null}
        <Text variant="muted">{t('gym.summary.adjustWins')}</Text>
        <TargetFields
          testID="adjust"
          meta={meta}
          unit={unit}
          profile={profile}
          weightKg={weightKg}
          onWeightKg={setWeightKg}
          repsFirst={repsFirst}
          onRepsFirst={setRepsFirst}
          allReps={reps}
          onEdit={setEditing}
        />
        {!online ? <Text variant="muted">{t('gym.summary.adjustOffline')}</Text> : null}
        {error ? (
          <Text testID="adjust-sheet-error" className="text-sm text-destructive">
            {error}
          </Text>
        ) : null}
      </Sheet>
      <TargetKeypad
        editing={editing}
        onClose={() => setEditing(null)}
        meta={meta}
        unit={unit}
        profile={profile}
        weightKg={weightKg}
        onWeightKg={setWeightKg}
        repsFirst={repsFirst}
        onRepsFirst={setRepsFirst}
      />
    </>
  );
}
