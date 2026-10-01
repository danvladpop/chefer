import { View } from 'react-native';
import { FRIENDS_COPY, type FriendProfileDto, type FriendsMeDto } from '@chefer/types';
import { ErrorState, Skeleton, Text } from '@chefer/ui-mobile';
import { trpc } from '../../../../lib/trpc';
import { LockedPanel } from '../../components/locked-panel';
import { sectionView } from '../sections';
import { useViewerUnits } from '../use-viewer-units';
import { FriendLastSevenDays } from './friend-last-seven-days';
import { FriendRoutineCard } from './friend-routine-card';

// ─── Gym tab (UX §10) ─────────────────────────────────────────────────────────
// `Routine` then `Last 7 days`, both from `friends.*` (INV-7: never a `gym.*`
// query, so nothing about another person reaches the 30-day gym disk cache).

export function GymTab({
  profile,
  me,
}: {
  profile: FriendProfileDto;
  me: FriendsMeDto | undefined;
}) {
  const view = sectionView(profile, 'workouts', me);
  if (view.kind === 'panel') {
    return <LockedPanel testID="friends-gym-panel" {...view.panel} />;
  }
  return <GymContent userId={profile.user.id} firstName={profile.user.firstName} />;
}

function GymContent({ userId, firstName }: { userId: string; firstName: string }) {
  const routine = trpc.friends.routine.useQuery({ userId }, { retry: false });
  const workouts = trpc.friends.workouts.useQuery({ userId }, { retry: false });
  const units = useViewerUnits();

  return (
    <View testID="friends-profile-gym" className="gap-4">
      <Text className="text-xs font-semibold uppercase tracking-widest text-gray-500">
        {FRIENDS_COPY.gym.routine}
      </Text>
      {routine.isLoading ? (
        <Skeleton testID="friends-routine-loading" className="h-40 w-full rounded-2xl" />
      ) : routine.isError && routine.data === undefined ? (
        <ErrorState
          testID="friends-routine-error"
          title={FRIENDS_COPY.profile.error}
          onRetry={() => void routine.refetch()}
        />
      ) : (
        <FriendRoutineCard routine={routine.data ?? null} firstName={firstName} />
      )}

      <Text className="text-xs font-semibold uppercase tracking-widest text-gray-500">
        {FRIENDS_COPY.gym.lastSevenDays}
      </Text>
      {workouts.isLoading ? (
        <Skeleton testID="friends-workouts-loading" className="h-32 w-full rounded-2xl" />
      ) : workouts.isError && workouts.data === undefined ? (
        <ErrorState
          testID="friends-workouts-error"
          title={FRIENDS_COPY.profile.error}
          onRetry={() => void workouts.refetch()}
        />
      ) : (
        <FriendLastSevenDays workouts={workouts.data ?? []} units={units} />
      )}
    </View>
  );
}
