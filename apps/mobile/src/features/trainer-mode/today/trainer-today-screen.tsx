import { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { TRAINER_MODE_COPY } from '@chefer/types';
import {
  EmptyState,
  ErrorState,
  KeyboardAwareScrollView,
  ListRow,
  ListSection,
  Screen,
  Stagger,
  Text,
  useFirstEntrance,
  useThemeColors,
} from '@chefer/ui-mobile';
import { Icon } from '../../../components/icon';
import { trpc } from '../../../lib/trpc';
import { useCoachingNotices } from '../../coaching/api/use-coaching-notices';
import { localDate } from '../../gym/offline/ids';
import { useTimedRefresh } from '../../gym/today/use-timed-refresh';
import { ShellTopBar } from '../../shell/shell-chrome';
import { TrainerNotices, trainerNoticeTitle } from '../../trainer/home/trainer-notices';
import { InviteSheet } from '../../trainer/invite/invite-screen';
import { NEW_TEMPLATE_HREF } from '../templates/library-screen';
import { useTrainerBadges } from '../use-trainer-mode';
import { clockTime, QuietClientRow, RequestsCard, WeekStats } from './today-parts';

// ─── Trainer Today (docs/prd-2026-10/trainer-mode.md §6.1, M1 parts) ──────────
// What needs the trainer now, top to bottom: the requests card (only while
// requests wait), "This week" (active clients of 50, average adherence,
// quiet clients), then "Needs attention" (quiet clients and the clients'
// notices, moved here from Trainer tools). The booking cards arrive in M3.
// A brand-new trainer (no clients, no requests) gets a welcome with the
// first steps instead. Pull to refresh asks for everything again; offline,
// the last answer stays with a "Last updated" line (§12).

const COPY = TRAINER_MODE_COPY.today;

export function TrainerTodayScreen() {
  const colors = useThemeColors();
  const utils = trpc.useUtils();
  // MO-03: the sections rise in on the first visit of the session only.
  const firstEntrance = useFirstEntrance('trainer-today');
  const [inviteOpen, setInviteOpen] = useState(false);
  const summary = trpc.trainer.dashboard.summary.useQuery({ today: localDate() });
  const badges = useTrainerBadges();
  const { notices } = useCoachingNotices('CLIENT');
  const noticeCount = notices.filter((n) => trainerNoticeTitle(n) !== null).length;

  const { refetch: refetchSummary } = summary;
  const { refetch: refetchBadges } = badges;
  const refetchAll = useCallback(
    () =>
      Promise.all([
        refetchSummary(),
        refetchBadges(),
        utils.coaching.notices.invalidate(),
        utils.trainer.requests.list.invalidate(),
      ]),
    [refetchSummary, refetchBadges, utils],
  );
  const { refreshing, onRefresh } = useTimedRefresh(refetchAll);
  // Tab screens stay mounted: a client accepted on Clients shows when Today is back in front.
  useFocusEffect(
    useCallback(() => {
      void refetchSummary();
    }, [refetchSummary]),
  );

  const topBar = <ShellTopBar className="mb-1" />;
  const d = summary.data;

  if (summary.isPending) {
    return (
      <Screen className="bg-canvas px-0" testID="trainer-today">
        <View className="gap-4 px-4 pt-3">
          {topBar}
          <View testID="trainer-today-loading" className="items-center py-10">
            <ActivityIndicator />
          </View>
        </View>
      </Screen>
    );
  }

  if (!d) {
    return (
      <Screen className="bg-canvas px-0" testID="trainer-today">
        <View className="px-4 pt-3">{topBar}</View>
        <ErrorState testID="trainer-today-error" onRetry={() => void summary.refetch()} />
      </Screen>
    );
  }

  // The polled badge is the freshest count; the summary's stands in until it answers.
  const requests = badges.loaded ? badges.requests : d.requestsWaiting;
  const brandNew = d.activeClients === 0 && requests === 0;
  // An answer on screen that the last refresh could not replace (offline, a failed refetch).
  const stale = summary.isRefetchError || summary.fetchStatus === 'paused';

  return (
    <Screen className="bg-canvas px-0" testID="trainer-today">
      <KeyboardAwareScrollView
        testID="trainer-today-scroll"
        contentContainerClassName="gap-6 px-4 pb-8 pt-3"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Stagger enabled={firstEntrance}>
          {topBar}

          {stale ? (
            <Text testID="trainer-today-last-updated" className="text-caption text-label-secondary">
              {COPY.lastUpdated(clockTime(summary.dataUpdatedAt))}
            </Text>
          ) : null}

          {requests > 0 ? <RequestsCard count={requests} /> : null}

          {brandNew ? (
            <View testID="trainer-today-welcome" className="gap-4">
              <EmptyState
                icon={<Icon name="clients" color={colors.labelTertiary} size={40} />}
                title={COPY.emptyTitle}
                description={COPY.emptyBody}
                className="py-4"
              />
              {/* §6.1 empty state. "Add a booking" joins with bookings (M3); "Build a
                  template" opens the editor on a new template (M2). */}
              <ListSection>
                <ListRow
                  testID="trainer-today-invite"
                  title={COPY.inviteClient}
                  icon={<Icon name="invite" color={colors.brand} />}
                  onPress={() => setInviteOpen(true)}
                />
                <ListRow
                  testID="trainer-today-build-template"
                  title={COPY.buildTemplate}
                  icon={<Icon name="workouts" color={colors.brand} />}
                  onPress={() => router.push(NEW_TEMPLATE_HREF)}
                />
              </ListSection>
            </View>
          ) : (
            <WeekStats
              activeClients={d.activeClients}
              maxClients={d.maxClients}
              averageAdherence={d.averageAdherence}
              quietClients={d.quietClients.length}
            />
          )}

          {brandNew ? null : (
            <View testID="trainer-today-attention" className="gap-2">
              <Text accessibilityRole="header" className="text-title3 font-bold text-label">
                {COPY.needsAttention}
              </Text>
              {d.quietClients.map((client) => (
                <QuietClientRow key={client.clientId} client={client} />
              ))}
              <TrainerNotices />
              {d.quietClients.length === 0 && noticeCount === 0 ? (
                <Text
                  testID="trainer-today-caught-up"
                  className="text-subhead text-label-secondary"
                >
                  {COPY.allCaughtUp}
                </Text>
              ) : null}
            </View>
          )}
        </Stagger>
      </KeyboardAwareScrollView>
      <InviteSheet visible={inviteOpen} onClose={() => setInviteOpen(false)} />
    </Screen>
  );
}
