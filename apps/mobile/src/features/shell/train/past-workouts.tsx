import { View } from 'react-native';
import { router } from 'expo-router';
import type { GymBootstrap, SessionSummaryDto } from '@chefer/types';
import { IconButton, MediaRow, PressableScale, Text, useThemeColors } from '@chefer/ui-mobile';
import {
  formatDistance,
  groupRecentSessions,
  isActivityLogSession,
  sessionStatsText,
  weekdayDateLabel,
  type RecentSessionRow,
} from '@chefer/utils';
import { Icon } from '../../../components/icon';
import { useSessionActions } from '../../gym/history/use-session-actions';
import { localDate } from '../../gym/offline/ids';
import { useRecentSessions } from '../../gym/today/use-recent-sessions';
import { TrainButton } from './train-button';

// "Past workouts" on Train (10 Oct redesign; owner: one per line). The same
// sessions and paging as the old Recent list (`useRecentSessions`), each a
// `MediaRow`: a barbell (or the activity glyph), the name, a 🏆 PR badge,
// "Wed 7 Oct · 61 min · 20 sets" (or the distance for an activity) and the
// same ⋯ menu (Edit workout / Delete workout with Undo).

function totalDistanceM(session: SessionSummaryDto): number {
  return session.exercises.reduce(
    (n, ex) => (ex.skipped ? n : n + ex.sets.reduce((m, s) => m + (s.distanceM ?? 0), 0)),
    0,
  );
}

/** "Wed 7 Oct · 61 min · 20 sets" / "Fri 2 Oct · 32 min · 5.1 km". */
export function pastWorkoutMeta(
  row: RecentSessionRow,
  session: SessionSummaryDto | undefined,
  distanceUnit: 'KM' | 'MI',
): { text: string; spoken: string } {
  const date = weekdayDateLabel(row.localDate);
  const distance = session ? totalDistanceM(session) : 0;
  if (row.activity && distance > 0) {
    const d = formatDistance(distance, distanceUnit);
    return {
      text: `${date} · ${row.durationMin} min · ${d}`,
      spoken: `${date}, ${row.durationMin} minutes, ${d}`,
    };
  }
  // The PR shows as the badge, so the stats line leaves it out.
  const stats = sessionStatsText({ ...row, hasPr: false });
  return { text: `${date} · ${stats.text}`, spoken: `${date}, ${stats.spoken}` };
}

export function PastWorkouts({ bootstrap }: { bootstrap: GymBootstrap }) {
  const colors = useThemeColors();
  const actions = useSessionActions({ bootstrap, source: 'recent', testIDPrefix: 'train-past' });
  const pager = useRecentSessions(bootstrap);
  const today = localDate();
  const distanceUnit = bootstrap.profile?.distanceUnit ?? 'KM';

  if (pager.combined.length === 0) return null;
  const rows = groupRecentSessions(pager.shown, today, {
    limit: pager.shown.length,
    prSessionIds: pager.prSessionIds,
  }).flatMap((group) => group.rows);

  return (
    <View testID="train-past" className="gap-2.5">
      <View className="flex-row items-center justify-between">
        <Text accessibilityRole="header" className="text-title3 font-bold text-label">
          Past workouts
        </Text>
        {/* MO-01 press feedback on the text link. */}
        <PressableScale
          testID="train-past-all"
          accessibilityRole="link"
          accessibilityLabel="All workout history"
          onPress={() => router.push({ pathname: '/training/stats', params: { tab: 'history' } })}
          className="min-h-11 flex-row items-center gap-0.5 pl-3"
        >
          <Text className="text-callout font-semibold text-brand">All</Text>
          <Icon name="chevronRight" color={colors.brand} size={18} />
        </PressableScale>
      </View>

      {rows.map((row) => {
        const session = pager.combined.find((s) => s.id === row.id);
        const activity = session ? isActivityLogSession(session) : row.activity;
        const meta = pastWorkoutMeta(row, session, distanceUnit);
        return (
          <MediaRow
            key={row.id}
            testID={`train-past-row-${row.id}`}
            title={row.name}
            meta={meta.text}
            badge={row.hasPr ? '🏆 PR' : undefined}
            illustration={
              <Icon name={activity ? 'activity' : 'barbell'} color={colors.brand} size={24} />
            }
            accessibilityHint="Opens the workout"
            onPress={() => router.push({ pathname: '/gym/session/[id]', params: { id: row.id } })}
            action={
              session ? (
                <IconButton
                  testID={`train-past-row-${row.id}-options`}
                  accessibilityLabel={`Options for ${session.name}, ${weekdayDateLabel(session.localDate)}`}
                  icon={<Icon name="more" color={colors.labelSecondary} />}
                  onPress={() => actions.openMenu(session)}
                />
              ) : null
            }
          />
        );
      })}

      {pager.loadError ? (
        <Text testID="train-past-error" className="text-caption text-label-secondary">
          {pager.online ? "Couldn't load older workouts." : 'Connect to load older workouts.'}
        </Text>
      ) : null}

      {pager.hasMoreToShow || pager.loadError ? (
        <TrainButton
          testID="train-past-show-more"
          label={pager.loadError ? 'Try again' : 'Show more'}
          variant="ghost"
          loading={pager.loadingMore}
          onPress={() => void pager.handleShowMore()}
        />
      ) : null}

      {actions.sheets}
    </View>
  );
}
