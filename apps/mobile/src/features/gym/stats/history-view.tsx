import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import type { GymBootstrap, SessionSummaryDto } from '@chefer/types';
import { EmptyState, IconButton, Text, useThemeColors } from '@chefer/ui-mobile';
import {
  cn,
  collectPrs,
  groupSessionsByWeek,
  sessionStatsOf,
  weekdayDateLabel,
} from '@chefer/utils';
import { Icon } from '../../../components/icon';
import { trpc } from '../../../lib/trpc';
import { TrainButton } from '../../shell/train/train-button';
import { sessionRowAccessibilityActions, useSessionActions } from '../history/use-session-actions';
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
  const colors = useThemeColors();
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
            className="px-4 text-subhead font-semibold text-label-secondary"
          >
            {`Week of ${weekdayDateLabel(group.weekStart)}`}
          </Text>
          <View className="overflow-hidden rounded-card border border-separator bg-surface">
            {group.sessions.map((session, index) => {
              const stats = sessionStatsOf(session, prSessionIds.has(session.id));
              const date = weekdayDateLabel(session.localDate);
              return (
                <View
                  key={session.id}
                  className={cn(
                    'min-h-11 flex-row items-center pr-1',
                    index > 0 && 'border-t border-separator',
                  )}
                >
                  {/* A full-width row highlights on press (MO-01's list variant). */}
                  <Pressable
                    testID={`${testID}-row-${session.id}`}
                    accessibilityRole="button"
                    accessibilityLabel={`${session.name}, ${date}, ${stats.spoken}`}
                    {...sessionRowAccessibilityActions(actions, session)}
                    onPress={() =>
                      router.push({ pathname: '/gym/session/[id]', params: { id: session.id } })
                    }
                    className="min-h-11 min-w-0 flex-1 flex-row items-center justify-between gap-2 py-3 pl-4 active:bg-surface-sunken"
                  >
                    <View className="min-w-0 flex-1 gap-0.5">
                      <Text className="text-body text-label" numberOfLines={2}>
                        {session.name}
                      </Text>
                      <Text className="text-subhead text-label-secondary">
                        {`${date} · ${stats.text}`}
                      </Text>
                    </View>
                    <Icon name="chevronRight" color={colors.labelTertiary} size={18} />
                  </Pressable>
                  <IconButton
                    testID={`${testID}-row-${session.id}-options`}
                    accessibilityLabel={`Options for ${session.name}, ${date}`}
                    icon={<Icon name="more" color={colors.labelSecondary} />}
                    onPress={() => actions.openMenu(session)}
                  />
                </View>
              );
            })}
          </View>
        </View>
      ))}

      {loadError ? (
        <Text testID={`${testID}-error`} className="text-caption text-label-secondary">
          {online ? "Couldn't load older workouts." : 'Connect to load older workouts.'}{' '}
          <Text
            className="font-semibold text-brand"
            accessibilityRole="link"
            onPress={() => void handleLoadMore()}
          >
            Try again
          </Text>
        </Text>
      ) : null}

      {hasMore ? (
        <TrainButton
          testID={`${testID}-load-more`}
          label="Load more"
          variant="outline"
          loading={loadingMore}
          onPress={() => void handleLoadMore()}
        />
      ) : null}

      {actions.sheets}
    </View>
  );
}
