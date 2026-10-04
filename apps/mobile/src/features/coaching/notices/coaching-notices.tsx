import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { COACHING_COPY, type GymBootstrap } from '@chefer/types';
import { Text } from '@chefer/ui-mobile';
import { formatShortDay } from '@chefer/utils';
import { COACHING_MOBILE_COPY } from '../copy';
import { clearPendingJoin, joinHref, usePendingJoin } from '../pending-join';
import {
  dismissStopped,
  isRoutineChangeUnseen,
  useDismissedStoppedAt,
  useSeenMarkersVersion,
} from '../seen-markers';
import { useCoachingStatus } from '../use-coaching-status';

// ─── Gym Today: one quiet line per coaching event (spec §2.6, §2.7) ───────────
// - "Ana updated your routine · 2 Oct" until the routine is opened on this device (device-local marker);
// - "Ana stopped coaching you" (30 days on the server, dismissible) when the trainer ended the link;
// - "Carry on joining your trainer" after the gym setup a join needed.
// Everything is gated on `coaching.availability`: with the flag off nothing renders and nothing but
// `availability` is asked. Mirrors apps/web/src/features/coaching/components/CoachingNotices.tsx.

function DismissButton({ testID, onPress }: { testID: string; onPress: () => void }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={COACHING_MOBILE_COPY.dismiss}
      onPress={onPress}
      className="-mr-2 h-11 w-11 items-center justify-center"
    >
      <Ionicons name="close" size={16} color="#9ca3af" />
    </Pressable>
  );
}

export function CoachingNotices({ bootstrap }: { bootstrap: GymBootstrap }) {
  const { enabled, data: status } = useCoachingStatus();
  const pending = usePendingJoin();
  const dismissed = useDismissedStoppedAt();
  // Re-render when the Routine tab marks the change as seen.
  useSeenMarkersVersion();

  const routine = bootstrap.activeRoutine;
  const changedBy = routine?.lastEditedByOther;
  const changed =
    enabled && routine && changedBy !== undefined && isRoutineChangeUnseen(routine.id, changedBy.at)
      ? changedBy
      : null;
  const stoppedNow = enabled ? (status?.stopped ?? null) : null;
  const stopped = stoppedNow !== null && dismissed !== stoppedNow.at ? stoppedNow : null;
  const joiningCode = enabled && status?.trainer === null ? pending : null;

  if (!changed && !stopped && !joiningCode) return null;

  return (
    <View testID="coaching-notices" className="gap-2">
      {changed ? (
        <Pressable
          testID="coaching-routine-updated"
          accessibilityRole="button"
          onPress={() => router.push('/routine')}
          className="min-h-11 min-w-0 flex-row items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2"
        >
          <Ionicons name="person-outline" size={16} color="#92400e" />
          <Text className="min-w-0 flex-1 text-sm text-amber-900">
            {COACHING_COPY.stamps.todayNotice(changed.name, formatShortDay(changed.at))}
          </Text>
        </Pressable>
      ) : null}
      {stopped ? (
        <View
          testID="coaching-stopped"
          className="min-w-0 flex-row items-center gap-2 rounded-xl border border-border bg-card px-3 py-1"
        >
          <Ionicons name="person-outline" size={16} color="#9ca3af" />
          <Text className="min-w-0 flex-1 text-sm text-gray-700">
            {COACHING_COPY.yourTrainer.stopped(stopped.trainerName)} · {formatShortDay(stopped.at)}
          </Text>
          <DismissButton
            testID="coaching-stopped-dismiss"
            onPress={() => dismissStopped(stopped.at)}
          />
        </View>
      ) : null}
      {joiningCode ? (
        <View
          testID="coaching-carry-on"
          className="min-w-0 flex-row items-center gap-2 rounded-xl border border-border bg-card px-3 py-1"
        >
          <Pressable
            testID="coaching-carry-on-link"
            accessibilityRole="link"
            onPress={() => router.push(joinHref(joiningCode))}
            className="min-h-11 min-w-0 flex-1 justify-center"
          >
            <Text className="text-sm font-medium text-gray-800 underline">
              {COACHING_MOBILE_COPY.carryOn}
            </Text>
          </Pressable>
          <DismissButton testID="coaching-carry-on-dismiss" onPress={clearPendingJoin} />
        </View>
      ) : null}
    </View>
  );
}
