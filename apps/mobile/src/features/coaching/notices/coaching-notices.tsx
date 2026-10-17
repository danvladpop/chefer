import { View } from 'react-native';
import { router } from 'expo-router';
import { COACHING_COPY, type GymBootstrap } from '@chefer/types';
import { IconButton, PressableScale, Text, useThemeColors } from '@chefer/ui-mobile';
import { formatShortDay } from '@chefer/utils';
import { Icon } from '../../../components/icon';
import { COACHING_MOBILE_COPY } from '../copy';
import { clearPendingJoin, joinHref, usePendingJoin } from '../pending-join';
import { routineHref } from '../routes';
import {
  dismissStopped,
  isRoutineChangeUnseen,
  useDismissedStoppedAt,
  useSeenMarkersVersion,
} from '../seen-markers';
import { useCoachingStatus } from '../use-coaching-status';

// ─── One quiet line per coaching event (spec §2.6, §2.7) ──────────────────────
// - "Ana updated your routine · 2 Oct" until the routine is opened on this device (device-local marker);
// - "Ana stopped coaching you" (30 days on the server, dismissible) when the trainer ended the link;
// - "Carry on joining your trainer" after the gym setup a join needed.
// Shown wherever the client's training is: the old Gym Today, and in the new shell the Train tab and
// Today's Training section. Everything is gated on `coaching.availability`: with the flag off nothing
// renders and nothing but `availability` is asked. Mirrors
// apps/web/src/features/coaching/components/CoachingNotices.tsx.

function DismissButton({ testID, onPress }: { testID: string; onPress: () => void }) {
  const colors = useThemeColors();
  return (
    <IconButton
      testID={testID}
      accessibilityLabel={COACHING_MOBILE_COPY.dismiss}
      icon={<Icon name="close" color={colors.labelSecondary} size={18} />}
      onPress={onPress}
      className="-mr-1"
    />
  );
}

export function CoachingNotices({ bootstrap }: { bootstrap: GymBootstrap }) {
  const colors = useThemeColors();
  const { enabled, data: status } = useCoachingStatus();
  const pending = usePendingJoin();
  const dismissed = useDismissedStoppedAt();
  // Re-render when the routine screen marks the change as seen.
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
        // MO-01: press feedback on the tappable notice.
        <PressableScale
          testID="coaching-routine-updated"
          accessibilityRole="button"
          onPress={() => router.push(routineHref())}
          className="min-h-11 min-w-0 flex-row items-center gap-2 rounded-card bg-brand-tint px-3 py-2"
        >
          <Icon name="yourTrainer" color={colors.brand} size={18} />
          <Text className="min-w-0 flex-1 text-subhead font-semibold text-label">
            {COACHING_COPY.stamps.todayNotice(changed.name, formatShortDay(changed.at))}
          </Text>
          <Icon name="chevronRight" color={colors.labelTertiary} size={16} />
        </PressableScale>
      ) : null}
      {stopped ? (
        <View
          testID="coaching-stopped"
          className="min-w-0 flex-row items-center gap-2 rounded-card border border-separator bg-surface py-1 pl-3 pr-1"
        >
          <Icon name="yourTrainer" color={colors.labelSecondary} size={18} />
          <Text className="min-w-0 flex-1 text-subhead text-label-secondary">
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
          className="min-w-0 flex-row items-center gap-2 rounded-card border border-separator bg-surface py-1 pl-3 pr-1"
        >
          <PressableScale
            testID="coaching-carry-on-link"
            accessibilityRole="link"
            onPress={() => router.push(joinHref(joiningCode))}
            className="min-h-11 min-w-0 flex-1 justify-center"
          >
            <Text className="text-subhead font-semibold text-brand">
              {COACHING_MOBILE_COPY.carryOn}
            </Text>
          </PressableScale>
          <DismissButton testID="coaching-carry-on-dismiss" onPress={clearPendingJoin} />
        </View>
      ) : null}
    </View>
  );
}
