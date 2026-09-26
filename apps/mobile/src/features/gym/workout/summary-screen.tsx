import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
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
  ValueStepper,
} from '@chefer/ui-mobile';
import { cn, formatLoad } from '@chefer/utils';
import { trpc } from '../../../lib/trpc';
import { gymBootstrapQueryKey, useGymBootstrap } from '../use-gym-bootstrap';
import { getFinished } from './finished-store';
import {
  nextTimeRows,
  sessionPrs,
  summaryFromDoc,
  summaryFromRecent,
  type NextTimeRow,
} from './summary-model';
import { useIsOnline } from './use-is-online';
import {
  DIRECTION_ICON,
  DIRECTION_LABEL,
  equipmentOf,
  fallbackMeta,
  formatDuration,
  nextLoad,
  unitOf,
} from './workout-model';

// Finish screen (gym_plan.md §1.1: the loop closes here). Shows what the
// engine decided for next time right away, from the optimistically folded
// cached bootstrap — so it is correct offline too.

const PR_KIND_LABEL = { e1rm: 'Estimated 1RM PR', weight: 'Weight PR', reps: 'Rep PR' } as const;

function goToday(): void {
  if (router.canDismiss()) router.dismissTo('/today');
  else router.replace('/today');
}

export function SummaryScreen({ id }: { id: string }) {
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
      <Screen edges={['top', 'bottom', 'left', 'right']}>
        <EmptyState
          testID="summary-missing"
          title="Workout saved"
          description="It will sync as soon as you have a connection."
          action={{ label: 'Done', onPress: goToday, testID: 'summary-done' }}
        />
      </Screen>
    );
  }

  const streak = bootstrap?.streak;
  const goal = streak?.thisWeekGoal ?? 0;
  const sessions = streak?.thisWeekSessions ?? 0;
  const streakLine = !streak
    ? null
    : streak.current > 0
      ? `${streak.current}-week streak${
          streak.flexTokens > 0
            ? ` · ${streak.flexTokens} flex ${streak.flexTokens === 1 ? 'week' : 'weeks'} saved`
            : ''
        }`
      : sessions >= goal && goal > 0
        ? 'Weekly goal met. Your streak starts now.'
        : `${Math.max(0, goal - sessions)} more this week to meet your goal.`;

  return (
    <Screen className="px-0" edges={['top', 'bottom', 'left', 'right']}>
      <ScrollView contentContainerClassName="gap-4 px-4 py-4">
        <View>
          <Text variant="muted">{view.name}</Text>
          <Text testID="summary-title" variant="title">
            Workout done
          </Text>
        </View>

        <View className="flex-row gap-2">
          <Stat
            testID="summary-duration"
            label="Duration"
            value={view.durationSec === null ? '—' : formatDuration(view.durationSec)}
          />
          <Stat testID="summary-sets" label="Sets" value={String(view.workingSets)} />
          <Stat testID="summary-prs" label="PRs" value={String(prs.length)} />
        </View>

        {streak ? (
          <Card className="flex-row items-center gap-4">
            <ProgressRing
              testID="summary-week-ring"
              progress={goal > 0 ? sessions / goal : 0}
              size={72}
              accessibilityLabel={`${sessions} of ${goal} workouts this week`}
            >
              <Text className="text-base font-bold">
                {sessions}/{goal}
              </Text>
            </ProgressRing>
            <View className="min-w-0 flex-1">
              <Text testID="summary-week" className="text-base font-semibold">
                {sessions} of {goal} this week
              </Text>
              {streakLine ? (
                <Text testID="summary-streak" variant="muted">
                  {streakLine}
                </Text>
              ) : null}
            </View>
          </Card>
        ) : null}

        {prs.length > 0 ? (
          <View className="gap-2">
            <Text variant="heading">Personal records</Text>
            {prs.map((pr) => {
              const meta = lookup(pr.exerciseId);
              return (
                <View
                  key={`${pr.exerciseId}-${pr.kind}`}
                  testID={`summary-pr-${pr.exerciseId}`}
                  className="flex-row items-center gap-3 rounded-xl bg-amber-50 px-3 py-2"
                >
                  <Text className="text-lg">🏆</Text>
                  <View className="min-w-0 flex-1">
                    <Text className="font-semibold">{meta.name}</Text>
                    <Text variant="muted">
                      {PR_KIND_LABEL[pr.kind]} · {formatLoad(pr.weightKg, unit, meta.loadType)} ×{' '}
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
            Next time
          </Text>
          {rows.length === 0 ? (
            <Text variant="muted">Your next targets appear here once this workout syncs.</Text>
          ) : null}
          {!online && rows.length > 0 ? (
            <Text testID="summary-offline" variant="muted" className="text-xs">
              Adjusting targets needs a connection. Your workout is saved and will sync.
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
                        ? 'bg-emerald-100'
                        : row.direction === 'down'
                          ? 'bg-amber-100'
                          : 'bg-muted',
                    )}
                  >
                    <Text
                      testID={`summary-next-${i}-direction`}
                      accessibilityLabel={DIRECTION_LABEL[row.direction]}
                      className="text-base font-bold"
                    >
                      {DIRECTION_ICON[row.direction]}
                    </Text>
                  </View>
                  <View className="min-w-0 flex-1">
                    <Text numberOfLines={1} className="font-semibold">
                      {meta.name}
                    </Text>
                    <Text testID={`summary-next-${i}-target`} variant="muted">
                      {formatLoad(s.weightKg, unit, meta.loadType)} × {s.reps.join(' / ')}
                      {meta.isTimed ? ' s' : ''}
                    </Text>
                  </View>
                  <Pressable
                    testID={`summary-next-${i}-adjust`}
                    accessibilityRole="button"
                    accessibilityLabel={`Adjust next target for ${meta.name}`}
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
                    <Text className="text-sm font-semibold text-primary">Adjust</Text>
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
            Next up: {bootstrap.nextWorkout.dayName}
          </Text>
        ) : null}

        <Button testID="summary-done" size="lg" onPress={goToday}>
          Done
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

function AdjustSheet({
  row,
  meta,
  bootstrap,
  onClose,
}: {
  row: NextTimeRow;
  meta: ExerciseDto;
  bootstrap: GymBootstrap | undefined;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const online = useIsOnline();
  const unit = unitOf(bootstrap);
  const profile = useMemo(() => equipmentOf(bootstrap), [bootstrap]);
  const s = row.progression.suggestion;
  const firstRep = s.reps[0] ?? 1;
  const [weightKg, setWeightKg] = useState(s.weightKg);
  const [repsFirst, setRepsFirst] = useState(firstRep);
  const [error, setError] = useState<string | null>(null);
  const reps = s.reps.map((r) => Math.max(1, r + (repsFirst - firstRep)));
  const mutation = trpc.gym.progression.setOverride.useMutation();

  const nextWeight = useCallback(
    (kg: number, direction: 1 | -1) => nextLoad(kg, direction, meta, profile),
    [meta, profile],
  );
  const nextReps = useCallback(
    (r: number, direction: 1 | -1) =>
      Math.min(meta.isTimed ? 3600 : 100, Math.max(1, r + direction)),
    [meta.isTimed],
  );
  const formatWeight = useCallback(
    (kg: number) => formatLoad(kg, unit, meta.loadType),
    [unit, meta.loadType],
  );
  const formatReps = useCallback((r: number) => String(r), []);

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
        onError: () => setError('Couldn’t save. Check your connection and try again.'),
      },
    );
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      title={meta.name}
      eyebrow="Next time"
      testID="adjust-sheet"
      footer={
        <Button
          testID="adjust-sheet-save"
          size="lg"
          loading={mutation.isPending}
          disabled={!online}
          onPress={save}
        >
          Save target
        </Button>
      }
    >
      <Text variant="muted">Your target wins over the suggestion, for the next session only.</Text>
      <View className="gap-1">
        <Text variant="label">Weight</Text>
        <ValueStepper
          testID="adjust-weight"
          name="Weight"
          value={weightKg}
          next={nextWeight}
          onChange={setWeightKg}
          format={formatWeight}
          caption=""
        />
      </View>
      <View className="gap-1">
        <Text variant="label">{meta.isTimed ? 'Seconds' : 'Reps'} on the first set</Text>
        <ValueStepper
          testID="adjust-reps"
          name={meta.isTimed ? 'Seconds' : 'Reps'}
          value={repsFirst}
          next={nextReps}
          onChange={setRepsFirst}
          format={formatReps}
          caption=""
        />
        <Text testID="adjust-reps-all" variant="muted">
          All sets: {reps.join(' / ')}
        </Text>
      </View>
      {!online ? <Text variant="muted">Adjusting targets needs a connection.</Text> : null}
      {error ? (
        <Text testID="adjust-sheet-error" className="text-sm text-destructive">
          {error}
        </Text>
      ) : null}
    </Sheet>
  );
}
