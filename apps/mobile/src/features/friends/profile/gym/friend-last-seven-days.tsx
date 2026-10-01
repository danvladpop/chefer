import { View } from 'react-native';
import { FRIENDS_COPY, type FriendWorkoutDto } from '@chefer/types';
import { Text } from '@chefer/ui-mobile';
import type { ViewerUnits } from '../use-viewer-units';
import { FriendWorkoutCard } from './friend-workout-card';

// ─── Last 7 days (UX §10, PRD FD-15 / FR-19) ──────────────────────────────────
// Every completed workout from the owner's today − 6 days to today, newest
// first, ALL in one list: no Load more, no paging (the API caps it at 30).

export function FriendLastSevenDays({
  workouts,
  units,
  testID = 'friends-workouts',
}: {
  workouts: readonly FriendWorkoutDto[];
  units: ViewerUnits;
  testID?: string;
}) {
  if (workouts.length === 0) {
    return (
      <Text testID={`${testID}-empty`} variant="muted" className="py-4 text-center">
        {FRIENDS_COPY.gym.noWorkouts}
      </Text>
    );
  }
  return (
    <View testID={testID} className="gap-3">
      {workouts.map((w) => (
        <FriendWorkoutCard key={w.id} workout={w} units={units} testID={`${testID}-${w.id}`} />
      ))}
    </View>
  );
}
