import { useMemo, useState } from 'react';
import type { GymBootstrap, SessionSummaryDto } from '@chefer/types';
import { collectPrs } from '@chefer/utils';
import { trpc } from '../../../lib/trpc';
import { useIsOnline } from '../library-screens/online-status';

// UX-36 amendment A2 (T-36.A2.1, AC13): the paging behind Gym Today's
// `Recent` and Train's `Past workouts`. "Show more" pages through the cached
// `bootstrap.recentSessions` first, then falls back to the online cursor
// (`gym.session.list`) once the cache is exhausted — offline that tier
// degrades to a "Connect to load older workouts." message.

const PAGE_SIZE = 5;
const INLINE_CAP = 13;

function cursorOf(session: SessionSummaryDto): string {
  return `${session.startedAt}|${session.id}`;
}

export function useRecentSessions(bootstrap: GymBootstrap) {
  const utils = trpc.useUtils();
  const online = useIsOnline();
  const cached = useMemo(
    () => bootstrap.recentSessions.filter((s) => s.status === 'COMPLETED'),
    [bootstrap.recentSessions],
  );
  const [extra, setExtra] = useState<SessionSummaryDto[]>([]);
  const [visibleCount, setVisibleCount] = useState(3);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [exhaustedOnline, setExhaustedOnline] = useState(false);

  const combined = useMemo(() => [...cached, ...extra], [cached, extra]);
  const prSessionIds = useMemo(
    () => new Set(collectPrs(combined, undefined, bootstrap.olderBests).map((r) => r.sessionId)),
    [combined, bootstrap.olderBests],
  );

  const shown = combined.slice(0, visibleCount);
  const hasMoreToShow =
    visibleCount < INLINE_CAP && (visibleCount < cached.length || !exhaustedOnline);

  const handleShowMore = async () => {
    setLoadError(false);
    if (visibleCount < cached.length) {
      setVisibleCount((v) => Math.min(INLINE_CAP, v + PAGE_SIZE));
      return;
    }
    if (!online) {
      setLoadError(true);
      return;
    }
    setLoadingMore(true);
    try {
      const last = combined.at(-1);
      const res = await utils.gym.session.list.fetch({
        cursor: last ? cursorOf(last) : undefined,
        limit: PAGE_SIZE,
      });
      setExtra((prev) => [...prev, ...res.items]);
      setVisibleCount((v) => Math.min(INLINE_CAP, v + res.items.length));
      if (res.items.length === 0 || res.nextCursor === null) setExhaustedOnline(true);
    } catch {
      setLoadError(true);
    } finally {
      setLoadingMore(false);
    }
  };

  return {
    online,
    combined,
    shown,
    prSessionIds,
    hasMoreToShow,
    loadingMore,
    loadError,
    handleShowMore,
  };
}
