import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { onlineManager } from '@tanstack/react-query';
import { router } from 'expo-router';
import type { GymBootstrap, SessionSummaryDto } from '@chefer/types';
import { Button, Text } from '@chefer/ui-mobile';
import { collectPrs, groupRecentSessions } from '@chefer/utils';
import { trpc } from '../../../lib/trpc';
import {
  SessionOptionsButton,
  sessionRowAccessibilityActions,
  useSessionActions,
} from '../history/use-session-actions';
import { localDate } from '../offline/ids';

// UX-36 amendment A2 (T-36.A2.1, O-10/O-11): the `Recent` section on Gym
// Today, replacing the old single "Last workout" row. Built on
// `groupRecentSessions()` (day-header grouping, pure + tested). "Show more"
// (AC13) pages through the cached `bootstrap.recentSessions` first, then
// falls back to the online cursor (`gym.session.list`) once the cache is
// exhausted — the online tier degrades to a "Connect to load older
// workouts." message offline, per spec.

const PAGE_SIZE = 5;
const INLINE_CAP = 13;

function cursorOf(session: SessionSummaryDto): string {
  return `${session.startedAt}|${session.id}`;
}

export interface RecentWorkoutsProps {
  bootstrap: GymBootstrap;
  testID?: string;
}

export function RecentWorkouts({ bootstrap, testID = 'gym-today-recent' }: RecentWorkoutsProps) {
  const utils = trpc.useUtils();
  const actions = useSessionActions({ bootstrap, source: 'recent', testIDPrefix: testID });
  const today = localDate();
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

  if (combined.length === 0) return null;

  const shown = combined.slice(0, visibleCount);
  const groups = groupRecentSessions(shown, today, { limit: shown.length, prSessionIds });
  const hasMoreToShow =
    visibleCount < INLINE_CAP && (visibleCount < cached.length || !exhaustedOnline);

  const handleShowMore = async () => {
    setLoadError(false);
    if (visibleCount < cached.length) {
      setVisibleCount((v) => Math.min(INLINE_CAP, v + PAGE_SIZE));
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
      setVisibleCount((v) => Math.min(INLINE_CAP, v + res.items.length));
      if (res.items.length === 0 || res.nextCursor === null) setExhaustedOnline(true);
    } catch {
      setLoadError(true);
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <View testID={testID} className="gap-3">
      <Text
        accessibilityRole="header"
        className="text-xs font-semibold tracking-wide text-muted-foreground"
      >
        RECENT
      </Text>

      {groups.map((group) => (
        <View key={group.localDate} className="gap-1.5">
          <Text
            testID={`${testID}-heading-${group.localDate}`}
            accessibilityRole="header"
            className="text-sm font-semibold"
          >
            {group.heading}
          </Text>
          {group.rows.map((row) => {
            const showTime = group.rows.length >= 2;
            const detail = `${row.durationMin} min · ${row.workingSets} sets${row.hasPr ? ' · PR' : ''}`;
            const a11yLabel = `${row.name}, ${group.heading}${showTime ? ` at ${row.startTime}` : ''}, ${row.durationMin} minutes, ${row.workingSets} sets${row.hasPr ? ', personal record' : ''}`;
            const session = combined.find((s) => s.id === row.id);
            return (
              <View
                key={row.id}
                className="min-h-11 flex-row items-center rounded-lg border border-border"
              >
                <Pressable
                  testID={`${testID}-row-${row.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={a11yLabel}
                  {...(session ? sessionRowAccessibilityActions(actions, session) : {})}
                  onPress={() =>
                    router.push({ pathname: '/gym/session/[id]', params: { id: row.id } })
                  }
                  className="min-h-11 min-w-0 flex-1 flex-row items-center justify-between gap-2 py-3 pl-4"
                >
                  <View className="min-w-0 flex-1 gap-0.5">
                    <Text className="text-sm font-medium">{row.name}</Text>
                    <Text variant="muted" className="text-xs">
                      {showTime ? `${row.startTime} · ${detail}` : detail}
                    </Text>
                  </View>
                  <Text className="text-primary">›</Text>
                </Pressable>
                {session ? (
                  <SessionOptionsButton
                    testID={`${testID}-row-${row.id}-options`}
                    session={session}
                    onPress={() => actions.openMenu(session)}
                  />
                ) : null}
              </View>
            );
          })}
        </View>
      ))}

      {loadError ? (
        <Text testID={`${testID}-error`} variant="muted" className="text-xs">
          {onlineManager.isOnline()
            ? "Couldn't load older workouts."
            : 'Connect to load older workouts.'}{' '}
          <Text className="text-primary" onPress={handleShowMore}>
            Try again
          </Text>
        </Text>
      ) : null}

      {loadingMore ? (
        <View testID={`${testID}-skeleton`} className="gap-1.5">
          <View className="h-11 rounded-lg bg-muted" />
          <View className="h-11 rounded-lg bg-muted" />
        </View>
      ) : null}

      <View className="flex-row items-center justify-between">
        {hasMoreToShow ? (
          <Button
            testID={`${testID}-show-more`}
            variant="outline"
            size="sm"
            loading={loadingMore}
            onPress={() => void handleShowMore()}
            accessibilityLabel="Show more"
          >
            Show more
          </Button>
        ) : (
          <View />
        )}
        <Pressable
          testID={`${testID}-all-history`}
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/stats', params: { tab: 'history' } })}
          className="min-h-11 justify-center"
        >
          <Text className="text-sm font-medium text-primary">All history ›</Text>
        </Pressable>
      </View>

      {actions.sheets}
    </View>
  );
}
