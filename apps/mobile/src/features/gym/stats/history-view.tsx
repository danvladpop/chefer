import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { onlineManager } from '@tanstack/react-query';
import { router } from 'expo-router';
import type { GymBootstrap, SessionSummaryDto } from '@chefer/types';
import { Button, EmptyState, Text } from '@chefer/ui-mobile';
import { collectPrs, groupSessionsByWeek, weekdayDateLabel } from '@chefer/utils';
import { trpc } from '../../../lib/trpc';

// T-36.5 (bug B-41's home): Stats › History — every completed session,
// week-grouped, newest first. First page from the cached
// `bootstrap.recentSessions` (offline-safe, 12 weeks); `Load more` pages the
// same cache first, then the online cursor (`gym.session.list`) once it's
// exhausted — same cache-then-cursor shape as Gym Today's `Recent` section.

const PAGE_SIZE = 10;

function cursorOf(session: SessionSummaryDto): string {
  return `${session.startedAt}|${session.id}`;
}

function durationMin(session: SessionSummaryDto): number {
  if (!session.finishedAt) return 0;
  return Math.max(
    0,
    Math.round(
      (new Date(session.finishedAt).getTime() - new Date(session.startedAt).getTime()) / 60000,
    ),
  );
}

function workingSetCount(session: SessionSummaryDto): number {
  return session.exercises.reduce(
    (n, ex) => n + ex.sets.filter((s) => !s.isWarmup && s.completed).length,
    0,
  );
}

export interface HistoryViewProps {
  bootstrap: GymBootstrap;
  testID?: string;
}

export function HistoryView({ bootstrap, testID = 'gym-history' }: HistoryViewProps) {
  const utils = trpc.useUtils();
  const cached = useMemo(
    () => bootstrap.recentSessions.filter((s) => s.status === 'COMPLETED'),
    [bootstrap.recentSessions],
  );
  const [extra, setExtra] = useState<SessionSummaryDto[]>([]);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [exhaustedOnline, setExhaustedOnline] = useState(false);

  const combined = useMemo(() => [...cached, ...extra], [cached, extra]);
  const prSessionIds = useMemo(
    () => new Set(collectPrs(combined, undefined, bootstrap.olderBests).map((r) => r.sessionId)),
    [combined, bootstrap.olderBests],
  );

  if (combined.length === 0) {
    return (
      <EmptyState
        testID={`${testID}-empty`}
        title="No workouts yet"
        description="Finished workouts show up here."
      />
    );
  }

  const shown = combined.slice(0, visibleCount);
  const groups = groupSessionsByWeek(shown);
  const hasMore = visibleCount < cached.length || !exhaustedOnline;

  const handleLoadMore = async () => {
    setLoadError(false);
    if (visibleCount < cached.length) {
      setVisibleCount((v) => v + PAGE_SIZE);
      return;
    }
    if (!onlineManager.isOnline()) {
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
      setVisibleCount((v) => v + res.items.length);
      if (res.items.length === 0 || res.nextCursor === null) setExhaustedOnline(true);
    } catch {
      setLoadError(true);
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <View testID={testID} className="gap-4">
      {groups.map((group) => (
        <View key={group.weekStart} className="gap-1.5">
          <Text
            testID={`${testID}-week-${group.weekStart}`}
            accessibilityRole="header"
            className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
          >
            {`Week of ${weekdayDateLabel(group.weekStart)}`}
          </Text>
          {group.sessions.map((session) => {
            const min = durationMin(session);
            const sets = workingSetCount(session);
            const hasPr = prSessionIds.has(session.id);
            return (
              <Pressable
                key={session.id}
                testID={`${testID}-row-${session.id}`}
                accessibilityRole="button"
                accessibilityLabel={`${session.name}, ${weekdayDateLabel(session.localDate)}, ${min} minutes, ${sets} sets${hasPr ? ', personal record' : ''}`}
                onPress={() =>
                  router.push({ pathname: '/gym/session/[id]', params: { id: session.id } })
                }
                className="min-h-11 flex-row items-center justify-between gap-2 rounded-lg border border-border px-4 py-3"
              >
                <View className="min-w-0 flex-1">
                  <Text className="text-sm font-medium">{session.name}</Text>
                  <Text variant="muted" className="text-xs">
                    {`${weekdayDateLabel(session.localDate)} · ${min} min · ${sets} sets${hasPr ? ' · PR' : ''}`}
                  </Text>
                </View>
                <Text className="text-primary">›</Text>
              </Pressable>
            );
          })}
        </View>
      ))}

      {loadError ? (
        <Text testID={`${testID}-error`} variant="muted" className="text-xs">
          {onlineManager.isOnline()
            ? "Couldn't load older workouts."
            : 'Connect to load older workouts.'}{' '}
          <Text className="text-primary" onPress={() => void handleLoadMore()}>
            Try again
          </Text>
        </Text>
      ) : null}

      {hasMore ? (
        <Button
          testID={`${testID}-load-more`}
          variant="outline"
          size="sm"
          loading={loadingMore}
          onPress={() => void handleLoadMore()}
        >
          Load more
        </Button>
      ) : null}
    </View>
  );
}
