import { ActivityIndicator, Pressable, View } from 'react-native';
import type { CoachedExerciseDto, CoachedWorkoutDto } from '@chefer/types';
import { Badge, Button, EmptyState, ErrorState, Text } from '@chefer/ui-mobile';
import { useT } from '../../../lib/i18n';
import { trpc } from '../../../lib/trpc';
import { loggedByYouLabel } from '../../trainer-coach/history-labels';
import { CoachingCard } from '../components/coaching-card';
import {
  doneAsPlannedText,
  formatCoachedSet,
  formatWeekdayDate,
  rirText,
  workoutTypeLine,
} from '../format';

// ─── Client › Workouts (spec §2.5 tab 2) ──────────────────────────────────────
// Completed workouts, newest first, paged. Each shows date, name, duration and per exercise the sets
// (weight × reps, warm-ups marked), skipped exercises and the last-set effort. Tapping an exercise opens
// its recent history. Nothing else about the client is in this payload (spec §7.2).
// PRD 2026-10 §4.3 ("Keep it simple" clients): an exercise ticked done with the plan untouched reads
// "Done as planned" and never shows its sets' numbers; a typed workout with no exercises reads
// "Yoga · 45 min". Never calories.

function ExerciseBlock({
  exercise,
  testID,
  onOpenHistory,
}: {
  exercise: CoachedExerciseDto;
  testID: string;
  onOpenHistory: (exercise: CoachedExerciseDto) => void;
}) {
  const { t } = useT();
  const asPlanned = doneAsPlannedText(exercise, t);
  // A ticked exercise's effort is the plan's, not something the client reported.
  const effort = asPlanned ? null : rirText(exercise.lastSetRir, t);
  return (
    <View testID={testID} className="gap-0.5 border-t border-border pt-2">
      <Pressable
        testID={`${testID}-name`}
        accessibilityRole="button"
        accessibilityLabel={t('coaching.trainer.workouts.historyFor', { name: exercise.name })}
        onPress={() => onOpenHistory(exercise)}
        className="min-h-11 justify-center"
      >
        <Text className="font-medium text-primary">{exercise.name}</Text>
      </Pressable>
      {exercise.skipped ? (
        <Text className="text-subhead text-label-secondary">
          {t('coaching.trainer.workouts.skipped')}
        </Text>
      ) : asPlanned ? (
        <Text testID={`${testID}-done-as-planned`} className="text-subhead text-label-secondary">
          {asPlanned}
        </Text>
      ) : (
        <Text testID={`${testID}-sets`} className="text-sm">
          {exercise.sets.map((set) => formatCoachedSet(set, t)).join('  ·  ')}
        </Text>
      )}
      {effort && !exercise.skipped ? (
        <Text className="text-caption text-label-secondary">{effort}</Text>
      ) : null}
    </View>
  );
}

export function WorkoutCard({
  workout,
  onOpenHistory,
}: {
  workout: CoachedWorkoutDto;
  onOpenHistory: (exercise: CoachedExerciseDto) => void;
}) {
  const { t } = useT();
  const typeLine = workoutTypeLine(workout, t);
  // Trainer mode M3: a workout this trainer logged in a session reads "Logged by you".
  const loggedBy = loggedByYouLabel(workout);
  return (
    <CoachingCard testID={`trainer-workout-${workout.id}`} className="gap-2">
      <View className="flex-row items-center gap-2">
        <Text className="min-w-0 flex-1 font-semibold" numberOfLines={2}>
          {workout.name}
        </Text>
        {workout.isDeload ? (
          <Badge variant="secondary">{t('coaching.trainer.workouts.deload')}</Badge>
        ) : null}
        {loggedBy ? (
          <Badge testID={`trainer-workout-${workout.id}-logged-by`} variant="secondary">
            {loggedBy}
          </Badge>
        ) : null}
      </View>
      <Text
        testID={`trainer-workout-${workout.id}-when`}
        className="text-subhead text-label-secondary"
      >
        {formatWeekdayDate(workout.localDate, t)}
        {typeLine === null && workout.durationMin !== null
          ? ` · ${t('common.counts.minutes', { count: workout.durationMin })}`
          : ''}
      </Text>
      {typeLine !== null ? (
        <Text testID={`trainer-workout-${workout.id}-type`} className="text-body text-label">
          {typeLine}
        </Text>
      ) : null}
      {workout.exercises.map((exercise) => (
        <ExerciseBlock
          key={exercise.exerciseId}
          testID={`trainer-workout-${workout.id}-${exercise.exerciseId}`}
          exercise={exercise}
          onOpenHistory={onOpenHistory}
        />
      ))}
    </CoachingCard>
  );
}

export function WorkoutsTab({
  clientId,
  firstName,
  onOpenHistory,
}: {
  clientId: string;
  firstName: string;
  onOpenHistory: (exercise: CoachedExerciseDto) => void;
}) {
  const { t } = useT();
  const query = trpc.trainer.client.workouts.useInfiniteQuery(
    { clientId, limit: 10 },
    { getNextPageParam: (page) => page.nextCursor ?? undefined },
  );
  if (query.isPending) {
    return (
      <View testID="trainer-workouts-loading" className="items-center py-10">
        <ActivityIndicator />
      </View>
    );
  }
  if (query.isError) {
    return <ErrorState testID="trainer-workouts-error" onRetry={() => void query.refetch()} />;
  }
  const workouts = query.data.pages.flatMap((p) => p.items);
  if (workouts.length === 0) {
    return (
      <EmptyState
        testID="trainer-workouts-empty"
        title={t('coaching.trainer.workouts.emptyTitle')}
        description={t('coaching.trainer.workouts.emptyBody', { client: firstName })}
      />
    );
  }
  return (
    <View testID="trainer-workouts" className="gap-3">
      {workouts.map((workout) => (
        <WorkoutCard key={workout.id} workout={workout} onOpenHistory={onOpenHistory} />
      ))}
      {query.hasNextPage ? (
        <Button
          testID="trainer-workouts-more"
          variant="outline"
          loading={query.isFetchingNextPage}
          onPress={() => void query.fetchNextPage()}
        >
          {t('coaching.common.showMore')}
        </Button>
      ) : null}
    </View>
  );
}
