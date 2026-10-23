import { useState } from 'react';
import { router } from 'expo-router';
import { CHECK_IN_COPY } from '@chefer/types';
import { trpc } from '../../../lib/trpc';
import { localDate } from '../../gym/offline/ids';
import { KV_KEYS } from '../../gym/offline/keys';
import { kv } from '../../gym/offline/kv';
import { NoticeCard } from '../notices/notice-card';
import { useCoachingStatus } from '../use-coaching-status';

// ─── "Ana's weekly check-in" on Today / Train (lane K3) ───────────────────────
// While the trainer's check-in is open and unanswered: Answer opens the check-in screen; Later hides
// the card until tomorrow on this device. Only asked for a coached client (`coaching.status.trainer`),
// so nobody else ever calls `coaching.checkIn.current`. Mirrors web CheckInPrompt.tsx.

export function CheckInPrompt() {
  const { enabled, data: status } = useCoachingStatus();
  const today = localDate();
  const [later, setLater] = useState(() => kv.getString(KV_KEYS.coachingCheckInLater));
  const current = trpc.coaching.checkIn.current.useQuery(
    { today },
    { enabled: enabled && !!status?.trainer, retry: false, staleTime: 5 * 60_000 },
  );
  const open = current.data;
  if (!open || open.answered || later === today) return null;
  const copy = CHECK_IN_COPY.client;
  return (
    <NoticeCard
      testID="coaching-check-in-prompt"
      tone="brand"
      icon="yourTrainer"
      title={copy.cardTitle(open.trainerName)}
      detail={copy.cardBody(open.questions.length)}
      viewLabel={copy.answer}
      onView={() => router.push('/coaching/check-in')}
      onDismiss={() => {
        kv.setString(KV_KEYS.coachingCheckInLater, today);
        setLater(today);
      }}
    />
  );
}
