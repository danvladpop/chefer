import type { CoachingNoticeDto } from '@chefer/types';
import { trpc } from '../../../lib/trpc';
import { useCoachingAvailability } from '../../trainer/api/use-coaching-availability';

// ─── Coaching notices (PRD 2026-10 §4.2, §4.3) ────────────────────────────────
// `coaching.notices` is one list for both sides: the client's cards come from their trainer
// (`other.role === 'TRAINER'`), the trainer's from their clients (`'CLIENT'`). Only unread ones render;
// Dismiss (and View) marks one read on the server, so it stays gone on every device. Asked only once
// `coaching.availability` says yes; never persisted (it is not a `gym.*` query).

export const COACHING_NOTICES_STALE_MS = 60_000;

export type CoachingNoticesState = {
  enabled: boolean;
  /** Unread notices from the other side of `role`, newest first as the API sends them. */
  notices: CoachingNoticeDto[];
  dismiss: (id: string) => void;
};

export function useCoachingNotices(from: 'TRAINER' | 'CLIENT'): CoachingNoticesState {
  const { enabled } = useCoachingAvailability();
  const utils = trpc.useUtils();
  const query = trpc.coaching.notices.useQuery(undefined, {
    enabled,
    retry: false,
    staleTime: COACHING_NOTICES_STALE_MS,
  });
  const dismissMutation = trpc.coaching.dismissNotice.useMutation({
    meta: { silent: true },
    onSettled: () => void utils.coaching.notices.invalidate(),
  });
  const all = enabled && !query.isError ? (query.data ?? []) : [];
  return {
    enabled,
    notices: all.filter((n) => !n.read && n.other.role === from),
    dismiss: (id) => {
      // Gone at once; the refetch after the call settles is the source of truth.
      utils.coaching.notices.setData(undefined, (list) =>
        list?.map((n) => (n.id === id ? { ...n, read: true } : n)),
      );
      dismissMutation.mutate({ id });
    },
  };
}
