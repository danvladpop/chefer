import { ActivityIndicator, Pressable, View } from 'react-native';
import type { CoachedExerciseDto, CoachedWorkoutDto } from '@chefer/types';
import { Badge, Button, Card, EmptyState, ErrorState, Text } from '@chefer/ui-mobile';
import { trpc } from '../../../lib/trpc';
import { formatCoachedSet, formatWeekdayDate, rirText } from '../format';

// ─── Client › Workouts (spec §2.5 tab 2) ──────────────────────────────────────
// Completed workouts, newest first, paged. Each shows date, name, duration and per exercise the sets
// (weight × reps, warm-ups marked), skipped exercises and the last-set effort. Tapping an exercise opens
// its recent history. Nothing else about the client is in this payload (spec §7.2).

function ExerciseBlock({
  exercise,
  testID,
  onOpenHistory,
}: {
  exercise: CoachedExerciseDto;
  testID: string;
  onOpenHistory: (exercise: CoachedExerciseDto) => void;
}) {
  const effort = rirText(exercise.lastSetRir);
  return (
    <View testID={testID} className="gap-0.5 border-t border-border pt-2">
      <Pressable
        testID={`${testID}-name`}
        accessibilityRole="button"
        accessibilityLabel={`${exercise.name}, recent history`}
        onPress={() => onOpenHistory(exercise)}
        className="min-h-11 justify-center"
      >
        <Text className="font-medium text-primary">{exercise.name}</Text>
      </Pressable>
      {exercise.skipped ? (
        <Text variant="muted" className="text-sm">
          Skipped
        </Text>
      ) : (
        <Text testID={`${testID}-sets`} className="text-sm">
          {exercise.sets.map(formatCoachedSet).join('  ·  ')}
        </Text>
      )}
      {effort && !exercise.skipped ? (
        <Text variant="muted" className="text-xs">
          {effort}
        </Text>
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
  return (
    <Card testID={`trainer-workout-${workout.id}`} className="gap-2">
      <View className="flex-row items-center gap-2">
        <Text className="min-w-0 flex-1 font-semibold" numberOfLines={2}>
          {workout.name}
        </Text>
        {workout.isDeload ? <Badge variant="secondary">Deload</Badge> : null}
      </View>
      <Text variant="muted" className="text-sm">
        {formatWeekdayDate(workout.localDate)}
        {workout.durationMin !== null ? ` · ${workout.durationMin} min` : ''}
      </Text>
      {workout.exercises.map((exercise) => (
        <ExerciseBlock
          key={exercise.exerciseId}
          testID={`trainer-workout-${workout.id}-${exercise.exerciseId}`}
          exercise={exercise}
          onOpenHistory={onOpenHistory}
        />
      ))}
    </Card>
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
        title="No workouts yet"
        description={`${firstName}'s completed workouts appear here.`}
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
          Show more
        </Button>
      ) : null}
    </View>
  );
}
