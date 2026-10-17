import { View } from 'react-native';
import { router } from 'expo-router';
import { COACHING_COPY, routineChangesLine, type CoachingNoticeDto } from '@chefer/types';
import { IconButton, PressableScale, Text, useThemeColors } from '@chefer/ui-mobile';
import { Icon } from '../../../components/icon';
import { useCoachingNotices } from '../api/use-coaching-notices';
import { COACHING_MOBILE_COPY } from '../copy';
import { clearPendingJoin, joinHref, usePendingJoin } from '../pending-join';
import { routineHref } from '../routes';
import { useCoachingStatus } from '../use-coaching-status';
import { NoticeCard } from './notice-card';

// ─── The client's coaching notices (PRD 2026-10 §4.2, §4.3) ───────────────────
// Server notices from the client's trainer, unread ones only, each dismissible (read on every device):
// - "Ana updated your routine" + what changed ("+ Romanian deadlift · Squat 3×8 → 4×6"), View opens the
//   routine and dismisses the card;
// - the coaching ended ("Ana stopped coaching you. Your routine stays yours." / "Your trainer stopped
//   using Chefer…");
// - "Ana is now your trainer" / "Ana can’t take you on right now" (a coaching request's answer).
// Plus the device-local "Carry on joining your trainer" after the gym setup an invite needed.
// Shown wherever the client's training is: the old Gym Today, Train and Today's Training section. Gated on
// `coaching.availability`: with the flag off nothing renders and nothing but `availability` is asked.
// Mirrors apps/web/src/features/coaching/components/CoachingNotices.tsx.

/** The line a client-side notice reads, or null for one this side never shows. */
export function clientNoticeTitle(notice: CoachingNoticeDto): string | null {
  const copy = COACHING_COPY.notices;
  switch (notice.kind) {
    case 'ROUTINE_UPDATED':
      return copy.routineUpdated(notice.other.name);
    case 'COACHING_ENDED':
      if (notice.endedBy === 'CLIENT') return null; // the client ended it themselves
      if (notice.endedBy === 'SYSTEM' && notice.other.id === null) return copy.trainerGone;
      return copy.endedByTrainer(notice.other.name);
    case 'REQUEST_ACCEPTED':
      return copy.requestAccepted(notice.other.name);
    case 'REQUEST_DECLINED':
      return copy.requestDeclined(notice.other.name);
    case 'REQUEST_RECEIVED':
      return null; // trainer side only
  }
}

export function CoachingNotices() {
  const colors = useThemeColors();
  const { enabled, data: status } = useCoachingStatus();
  const { notices, dismiss } = useCoachingNotices('TRAINER');
  const pending = usePendingJoin();
  const joiningCode = enabled && status?.trainer === null ? pending : null;

  const cards = notices.flatMap((notice) => {
    const title = clientNoticeTitle(notice);
    return title === null ? [] : [{ notice, title }];
  });
  if (cards.length === 0 && !joiningCode) return null;

  return (
    <View testID="coaching-notices" className="gap-2">
      {cards.map(({ notice, title }) =>
        notice.kind === 'ROUTINE_UPDATED' ? (
          <NoticeCard
            key={notice.id}
            testID="coaching-routine-updated"
            tone="brand"
            title={title}
            detail={notice.changes?.length ? routineChangesLine(notice.changes) : null}
            onView={() => {
              dismiss(notice.id);
              router.push(routineHref());
            }}
            onDismiss={() => dismiss(notice.id)}
          />
        ) : (
          <NoticeCard
            key={notice.id}
            testID={`coaching-notice-${notice.kind.toLowerCase()}`}
            title={title}
            onDismiss={() => dismiss(notice.id)}
          />
        ),
      )}
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
          <IconButton
            testID="coaching-carry-on-dismiss"
            accessibilityLabel={COACHING_MOBILE_COPY.dismiss}
            icon={<Icon name="close" color={colors.labelSecondary} size={18} />}
            onPress={clearPendingJoin}
          />
        </View>
      ) : null}
    </View>
  );
}
