'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { trpc } from '@/lib/trpc';
import type { GymBootstrap, SessionSummaryDto } from '@chefer/types';
import { Button } from '@chefer/ui';
import { collectPrs, groupRecentSessions } from '@chefer/utils';
import { SessionOptionsMenu } from '../history/SessionOptionsMenu';
import { useDeleteWorkout } from '../history/use-delete-workout';
import { CardLabel } from '../shared/gym-card';

// UX-36 amendment A2 (T-36.A2.2, O-10/O-11) on the web: the `Recent` section
// replacing the single "Last session" link — built on the same pure
// `groupRecentSessions()` as the phone: day headers (Today / Yesterday /
// {weekday d Mon}), the start time only when two sessions share a day, 3 rows
// by default, `Show more` (+5, up to 13 inline; cache first, then the cursor),
// then `All history ›`. Each row has a `⋯` (T-44.5: Delete workout + Undo).

const PAGE_SIZE = 5;
const INLINE_CAP = 13;

function cursorOf(session: SessionSummaryDto): string {
  return `${session.startedAt}|${session.id}`;
}

function browserOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine;
}

export function RecentWorkouts({ data, today }: { data: GymBootstrap; today: string }) {
  const utils = trpc.useUtils();
  const { ask, sheet } = useDeleteWorkout({ bootstrap: data, source: 'recent' });
  const cached = useMemo(
    () => data.recentSessions.filter((s) => s.status === 'COMPLETED'),
    [data.recentSessions],
  );
  const [extra, setExtra] = useState<SessionSummaryDto[]>([]);
  const [visibleCount, setVisibleCount] = useState(3);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<'offline' | 'failed' | null>(null);
  const [exhaustedOnline, setExhaustedOnline] = useState(false);
  const [announcement, setAnnouncement] = useState('');

  const combined = useMemo(() => [...cached, ...extra], [cached, extra]);
  const prSessionIds = useMemo(
    () => new Set(collectPrs(combined, undefined, data.olderBests).map((r) => r.sessionId)),
    [combined, data.olderBests],
  );

  if (combined.length === 0) return <>{sheet}</>;

  const shown = combined.slice(0, visibleCount);
  const groups = groupRecentSessions(shown, today, { limit: shown.length, prSessionIds });
  const hasMore = visibleCount < INLINE_CAP && (visibleCount < cached.length || !exhaustedOnline);

  const showMore = async () => {
    setLoadError(null);
    if (visibleCount < cached.length) {
      const next = Math.min(INLINE_CAP, visibleCount + PAGE_SIZE);
      setAnnouncement(`${next - visibleCount} more workouts loaded`);
      setVisibleCount(next);
      return;
    }
    if (!browserOnline()) {
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
      setVisibleCount((v) => Math.min(INLINE_CAP, v + res.items.length));
      setAnnouncement(`${res.items.length} more workouts loaded`);
      if (res.items.length === 0 || res.nextCursor === null) setExhaustedOnline(true);
    } catch {
      setLoadError('failed');
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <section aria-labelledby="gym-recent-heading" data-testid="gym-recent" className="space-y-3">
      <CardLabel>
        <span id="gym-recent-heading">Recent</span>
      </CardLabel>

      {groups.map((group) => (
        <div key={group.localDate} className="space-y-1.5">
          <h3
            className="text-sm font-semibold text-gray-900"
            data-testid={`gym-recent-heading-${group.localDate}`}
          >
            {group.heading}
          </h3>
          <ul className="space-y-1.5">
            {group.rows.map((row) => {
              const showTime = group.rows.length >= 2;
              const detail = `${row.durationMin} min · ${row.workingSets} sets${row.hasPr ? ' · PR' : ''}`;
              const session = combined.find((s) => s.id === row.id);
              return (
                <li
                  key={row.id}
                  className="flex items-center rounded-xl border bg-white shadow-sm"
                  data-testid={`gym-recent-row-${row.id}`}
                >
                  <Link
                    href={`/gym/history/${row.id}`}
                    aria-label={`${row.name}, ${group.heading}${showTime ? ` at ${row.startTime}` : ''}, ${row.durationMin} minutes, ${row.workingSets} sets${row.hasPr ? ', personal record' : ''}`}
                    className="flex min-h-11 min-w-0 flex-1 items-center justify-between gap-2 rounded-xl py-3 pl-4 pr-1 hover:bg-gray-50"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-gray-900">{row.name}</span>
                      <span className="block text-xs text-gray-500">
                        {showTime ? `${row.startTime} · ${detail}` : detail}
                      </span>
                    </span>
                    <span className="text-[#944a00]" aria-hidden="true">
                      ›
                    </span>
                  </Link>
                  {session ? (
                    <SessionOptionsMenu
                      testId={`gym-recent-options-${row.id}`}
                      label={`${row.name}, ${group.heading}`}
                      onDelete={() => ask(session)}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      {loadError ? (
        <p role="status" className="text-xs text-gray-500" data-testid="gym-recent-error">
          {loadError === 'offline'
            ? 'Connect to load older workouts.'
            : 'Couldn’t load older workouts.'}{' '}
          <button
            type="button"
            className="font-medium text-[#944a00] hover:underline"
            onClick={() => void showMore()}
          >
            Try again
          </button>
        </p>
      ) : null}

      {loadingMore ? (
        <div className="space-y-1.5" aria-hidden="true">
          <div className="h-11 animate-pulse rounded-xl bg-neutral-100" />
          <div className="h-11 animate-pulse rounded-xl bg-neutral-100" />
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        {hasMore ? (
          <Button
            variant="outline"
            size="sm"
            loading={loadingMore}
            onClick={() => void showMore()}
            data-testid="gym-recent-show-more"
          >
            Show more
          </Button>
        ) : (
          <span />
        )}
        <Link
          href="/gym/history"
          className="inline-flex min-h-11 items-center text-sm font-medium text-[#944a00] hover:underline"
          data-testid="gym-recent-all-history"
        >
          All history ›
        </Link>
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
      {sheet}
    </section>
  );
}
