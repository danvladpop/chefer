import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import type { GymBootstrap, SessionSummaryDto } from '@chefer/types';
import { Button, EmptyState, Text } from '@chefer/ui-mobile';
import { collectPrs, groupSessionsByWeek, sessionStatsOf, weekdayDateLabel } from '@chefer/utils';
import { trpc } from '../../../lib/trpc';
import {
  SessionOptionsButton,
  sessionRowAccessibilityActions,
  useSessionActions,
} from '../history/use-session-actions';
import { useIsOnline } from '../library-screens/online-status';
import { LogActivityAction } from '../today/log-activity-sheet';

// T-36.5 (bug B-41's home): Stats › History — every completed session,
// week-grouped, newest first. First page from the cached
// `bootstrap.recentSessions` (offline-safe, 12 weeks); `Load more` pages the
// same cache first, then the online cursor (`gym.session.list`) once it's
// exhausted — same cache-then-cursor shape as Gym Today's `Recent` section.

const PAGE_SIZE = 10;

function cursorOf(session: SessionSummaryDto): string {
  return `${session.startedAt}|${session.id}`;
}

export interface HistoryViewProps {
  bootstrap: GymBootstrap;
  testID?: string;
}

export function HistoryView({ bootstrap, testID = 'gym-history' }: HistoryViewProps) {
  const utils = trpc.useUtils();
  const online = useIsOnline();
  const actions = useSessionActions({ bootstrap, source: 'history', testIDPrefix: testID });
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
  // UX-GYM-33: "Load more" only shows when something older exists. One cheap
  // probe past the cached window tells us (offline, we can't know, so it stays).
  const lastCached = cached.at(-1);
  const olderProbe = trpc.gym.session.list.useQuery(
    { cursor: lastCached ? cursorOf(lastCached) : undefined, limit: 1 },
    { enabled: online && cached.length > 0 },
  );
  const nothingOlder = olderProbe.data?.items.length === 0;

  if (combined.length === 0) {
    return (
      <View className="gap-2">
        <EmptyState
          testID={`${testID}-empty`}
          title="No workouts yet"
          description="Finished workouts show up here."
        />
        <View className="items-center">
          <LogActivityAction bootstrap={bootstrap} testID={`${testID}-log-activity`} />
        </View>
      </View>
    );
  }

  const shown = combined.slice(0, visibleCount);
  const groups = groupSessionsByWeek(shown);
  const hasMore = visibleCount < cached.length || (!exhaustedOnline && !nothingOlder);

  const handleLoadMore = async () => {
    setLoadError(false);
    if (visibleCount < cached.length) {
      setVisibleCount((v) => v + PAGE_SIZE);
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
      {/* WP-20: a class done elsewhere can be logged from here too. */}
      <View className="items-start">
        <LogActivityAction bootstrap={bootstrap} testID={`${testID}-log-activity`} />
      </View>
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
            const stats = sessionStatsOf(session, prSessionIds.has(session.id));
            return (
              <View
                key={session.id}
                className="min-h-11 flex-row items-center rounded-lg border border-border"
              >
                <Pressable
                  testID={`${testID}-row-${session.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${session.name}, ${weekdayDateLabel(session.localDate)}, ${stats.spoken}`}
                  {...sessionRowAccessibilityActions(actions, session)}
                  onPress={() =>
                    router.push({ pathname: '/gym/session/[id]', params: { id: session.id } })
                  }
                  className="min-h-11 min-w-0 flex-1 flex-row items-center justify-between gap-2 py-3 pl-4"
                >
                  <View className="min-w-0 flex-1">
                    <Text className="text-sm font-medium">{session.name}</Text>
                    <Text variant="muted" className="text-xs">
                      {`${weekdayDateLabel(session.localDate)} · ${stats.text}`}
                    </Text>
                  </View>
                  <Text className="text-primary">›</Text>
                </Pressable>
                <SessionOptionsButton
                  testID={`${testID}-row-${session.id}-options`}
                  session={session}
                  onPress={() => actions.openMenu(session)}
                />
              </View>
            );
          })}
        </View>
      ))}

      {loadError ? (
        <Text testID={`${testID}-error`} variant="muted" className="text-xs">
          {online ? "Couldn't load older workouts." : 'Connect to load older workouts.'}{' '}
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

      {actions.sheets}
    </View>
  );
}
