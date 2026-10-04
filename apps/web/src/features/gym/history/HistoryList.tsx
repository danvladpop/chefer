'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { trpc } from '@/lib/trpc';
import type { GymBootstrap, SessionSummaryDto } from '@chefer/types';
import { Button } from '@chefer/ui';
import { collectPrs, groupSessionsByWeek, sessionStatsOf, weekdayDateLabel } from '@chefer/utils';
import { GymCard } from '../shared/gym-card';
import { SessionOptionsMenu } from './SessionOptionsMenu';
import { useDeleteWorkout } from './use-delete-workout';

// Workout history list (T-36.5 / T-36.7): every completed session, week-grouped,
// newest first — the web twin of the phone's Stats › History. First page from
// the bootstrap's cached sessions (12 weeks), then `gym.session.list` by cursor.
// Each row: a link to the detail (`/gym/history/[id]`) and a `⋯` (Delete + Undo).

const PAGE_SIZE = 10;

function cursorOf(session: SessionSummaryDto): string {
  return `${session.startedAt}|${session.id}`;
}

export function HistoryList({ data }: { data: GymBootstrap }) {
  const utils = trpc.useUtils();
  const { ask, sheet } = useDeleteWorkout({ bootstrap: data, source: 'history' });
  const cached = useMemo(
    () => data.recentSessions.filter((s) => s.status === 'COMPLETED'),
    [data.recentSessions],
  );
  const [extra, setExtra] = useState<SessionSummaryDto[]>([]);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<'offline' | 'failed' | null>(null);
  const [exhaustedOnline, setExhaustedOnline] = useState(false);

  const combined = useMemo(() => [...cached, ...extra], [cached, extra]);
  const prSessionIds = useMemo(
    () => new Set(collectPrs(combined, undefined, data.olderBests).map((r) => r.sessionId)),
    [combined, data.olderBests],
  );

  // UX-GYM-33: "Load more" only shows when something older exists. One cheap
  // probe past the cached window tells us.
  const lastCached = cached.at(-1);
  const olderProbe = trpc.gym.session.list.useQuery(
    { ...(lastCached ? { cursor: cursorOf(lastCached) } : {}), limit: 1 },
    { enabled: cached.length > 0 },
  );
  const nothingOlder = olderProbe.data?.items.length === 0;

  if (combined.length === 0) {
    return (
      <GymCard className="text-center" data-testid="gym-history-empty">
        <p className="text-sm font-semibold text-gray-900">No workouts yet</p>
        <p className="mt-1 text-sm text-gray-500">Finished workouts show up here.</p>
      </GymCard>
    );
  }

  const groups = groupSessionsByWeek(combined.slice(0, visibleCount));
  const hasMore = visibleCount < cached.length || (!exhaustedOnline && !nothingOlder);

  const loadMore = async () => {
    setLoadError(null);
    if (visibleCount < cached.length) {
      setVisibleCount((v) => v + PAGE_SIZE);
      return;
    }
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setLoadError('offline');
      return;
    }
    setLoadingMore(true);
    try {
      const last = combined.at(-1);
      const res = await utils.gym.session.list.fetch({
        ...(last ? { cursor: cursorOf(last) } : {}),
        limit: PAGE_SIZE,
      });
      setExtra((prev) => [...prev, ...res.items]);
      setVisibleCount((v) => v + res.items.length);
      if (res.items.length === 0 || res.nextCursor === null) setExhaustedOnline(true);
    } catch {
      setLoadError('failed');
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="space-y-5" data-testid="gym-history">
      {groups.map((group) => (
        <section key={group.weekStart} className="space-y-1.5">
          <h2
            className="text-xs font-semibold uppercase tracking-wider text-gray-500"
            data-testid={`gym-history-week-${group.weekStart}`}
          >
            {`Week of ${weekdayDateLabel(group.weekStart)}`}
          </h2>
          <ul className="space-y-1.5">
            {group.sessions.map((session) => {
              // WP-20: an activity reads "45 min · ~400 kcal", never "1 sets".
              const stats = sessionStatsOf(session, prSessionIds.has(session.id));
              const day = weekdayDateLabel(session.localDate);
              return (
                <li
                  key={session.id}
                  className="flex items-center rounded-xl border bg-white shadow-sm"
                  data-testid={`gym-history-row-${session.id}`}
                >
                  <Link
                    href={`/gym/history/${session.id}`}
                    aria-label={`${session.name}, ${day}, ${stats.spoken}`}
                    className="flex min-h-11 min-w-0 flex-1 items-center justify-between gap-2 rounded-xl py-3 pl-4 pr-1 hover:bg-gray-50"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-gray-900">
                        {session.name}
                      </span>
                      <span className="block text-xs text-gray-500">
                        {`${day} · ${stats.text}`}
                      </span>
                    </span>
                    <span className="text-[#944a00]" aria-hidden="true">
                      ›
                    </span>
                  </Link>
                  <SessionOptionsMenu
                    testId={`gym-history-options-${session.id}`}
                    label={`${session.name}, ${day}`}
                    onDelete={() => ask(session)}
                  />
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {loadError ? (
        <p role="status" className="text-xs text-gray-500" data-testid="gym-history-error">
          {loadError === 'offline'
            ? 'Connect to load older workouts.'
            : 'Couldn’t load older workouts.'}{' '}
          <button
            type="button"
            className="font-medium text-[#944a00] hover:underline"
            onClick={() => void loadMore()}
          >
            Try again
          </button>
        </p>
      ) : null}

      {hasMore ? (
        <Button
          variant="outline"
          size="sm"
          loading={loadingMore}
          onClick={() => void loadMore()}
          data-testid="gym-history-load-more"
        >
          Load more
        </Button>
      ) : null}
      {sheet}
    </div>
  );
}
