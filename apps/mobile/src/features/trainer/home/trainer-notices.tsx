import { View } from 'react-native';
import { router } from 'expo-router';
import type { Translator } from '@chefer/i18n';
import type { CoachingNoticeDto } from '@chefer/types';
import { getTranslator, useT } from '../../../lib/i18n';
import { useCoachingNotices } from '../../coaching/api/use-coaching-notices';
import { routineChangesLineT } from '../../coaching/copy';
import { NoticeCard } from '../../coaching/notices/notice-card';

// ─── The trainer's coaching notices (PRD 2026-10 §4.2, §4.3) ──────────────────
// Unread notices from clients on Trainer tools → Clients: "Maria changed their routine" + what changed
// (View opens that client), "Maria left. Their routine stays theirs.", "Maria asked you to coach them"
// (answered in Requests, right below). Each is dismissible and read on every device.

/** The line a trainer-side notice reads, or null for one this side never shows. */
export function trainerNoticeTitle(
  notice: CoachingNoticeDto,
  t: Translator['t'] = getTranslator().t,
): string | null {
  const client = notice.other.name;
  switch (notice.kind) {
    case 'ROUTINE_UPDATED':
      return t('coaching.notices.clientUpdated', { client });
    case 'COACHING_ENDED':
      return notice.endedBy === 'TRAINER' ? null : t('coaching.notices.endedByClient', { client });
    case 'REQUEST_RECEIVED':
      return t('coaching.notices.requestReceived', { client });
    case 'REQUEST_ACCEPTED':
    case 'REQUEST_DECLINED':
    case 'BOOKING_CREATED':
    case 'BOOKING_CHANGED':
    case 'BOOKING_CANCELLED':
    case 'COACHED_WORKOUT_LOGGED':
      return null; // client side only
  }
}

export function TrainerNotices() {
  const { t } = useT();
  const { notices, dismiss } = useCoachingNotices('CLIENT');
  const cards = notices.flatMap((notice) => {
    const title = trainerNoticeTitle(notice, t);
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
              detail={notice.changes?.length ? routineChangesLineT(notice.changes, t) : null}
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
