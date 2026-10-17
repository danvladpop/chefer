import { View } from 'react-native';
import { router } from 'expo-router';
import { COACHING_COPY, routineChangesLine, type CoachingNoticeDto } from '@chefer/types';
import { useCoachingNotices } from '../../coaching/api/use-coaching-notices';
import { NoticeCard } from '../../coaching/notices/notice-card';

// ─── The trainer's coaching notices (PRD 2026-10 §4.2, §4.3) ──────────────────
// Unread notices from clients on Trainer tools → Clients: "Maria changed their routine" + what changed
// (View opens that client), "Maria left. Their routine stays theirs.", "Maria asked you to coach them"
// (answered in Requests, right below). Each is dismissible and read on every device.

/** The line a trainer-side notice reads, or null for one this side never shows. */
export function trainerNoticeTitle(notice: CoachingNoticeDto): string | null {
  const copy = COACHING_COPY.notices;
  switch (notice.kind) {
    case 'ROUTINE_UPDATED':
      return copy.clientUpdated(notice.other.name);
    case 'COACHING_ENDED':
      return notice.endedBy === 'TRAINER' ? null : copy.endedByClient(notice.other.name);
    case 'REQUEST_RECEIVED':
      return copy.requestReceived(notice.other.name);
    case 'REQUEST_ACCEPTED':
    case 'REQUEST_DECLINED':
      return null; // client side only
  }
}

export function TrainerNotices() {
  const { notices, dismiss } = useCoachingNotices('CLIENT');
  const cards = notices.flatMap((notice) => {
    const title = trainerNoticeTitle(notice);
    return title === null ? [] : [{ notice, title }];
  });
  if (cards.length === 0) return null;
  return (
    <View testID="trainer-notices" className="gap-2">
      {cards.map(({ notice, title }) => {
        const clientId = notice.other.id;
        const testID = `trainer-notice-${notice.id}`;
        if (notice.kind === 'ROUTINE_UPDATED') {
          return (
            <NoticeCard
              key={notice.id}
              testID={testID}
              tone="brand"
              icon="clients"
              title={title}
              detail={notice.changes?.length ? routineChangesLine(notice.changes) : null}
              {...(clientId
                ? {
                    onView: () => {
                      dismiss(notice.id);
                      router.push(`/trainer/${clientId}`);
                    },
                  }
                : {})}
              onDismiss={() => dismiss(notice.id)}
            />
          );
        }
        return (
          <NoticeCard
            key={notice.id}
            testID={testID}
            icon="clients"
            title={title}
            onDismiss={() => dismiss(notice.id)}
          />
        );
      })}
    </View>
  );
}
