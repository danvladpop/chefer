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
import { deviceTimeZone, todayIn } from '@chefer/utils';
import { Icon } from '../../../components/icon';
import { trpc } from '../../../lib/trpc';
import { useCoachingNotices } from '../../coaching/api/use-coaching-notices';
import { localDate } from '../../gym/offline/ids';
import { useTimedRefresh } from '../../gym/today/use-timed-refresh';
import { ShellTopBar } from '../../shell/shell-chrome';
import { todaysBookingsOf, useCoachPrefetch } from '../../trainer-coach/coach-prefetch';
import { TrainerNotices, trainerNoticeTitle } from '../../trainer/home/trainer-notices';
import { InviteSheet } from '../../trainer/invite/invite-screen';
import { useBookingEditor } from '../bookings/booking-editor';
import { NEW_TEMPLATE_HREF } from '../templates/library-screen';
import { useTrainerBadges } from '../use-trainer-mode';
import {
  LaterToday,
  NextBookingCard,
  SessionsDelivered,
  UnmarkedAttendance,
} from './booking-parts';
import { clockTime, QuietClientRow, RequestsCard, WeekStats } from './today-parts';

// ─── Trainer Today (docs/prd-2026-10/trainer-mode.md §6.1, M1 parts) ──────────
// What needs the trainer now, top to bottom: the requests card (only while
// requests wait), "This week" (active clients of 50, average adherence,
// quiet clients), then "Needs attention" (quiet clients and the clients'
// notices, moved here from Trainer tools). M3 adds the booking parts: the
// next booking (Start from 15 minutes before) or "No bookings today" + Add a
// booking, the rest of today, bookings this week in the stats, past bookings
// waiting for attendance, and sessions delivered this month.
// A brand-new trainer (no clients, no requests) gets a welcome with the
// first steps instead (Invite a client, Build a template, Add a booking). Pull to refresh asks for everything again; offline,
// the last answer stays with a "Last updated" line (§12).

const COPY = TRAINER_MODE_COPY.today;

export function TrainerTodayScreen() {
  const colors = useThemeColors();
  const utils = trpc.useUtils();
  // MO-03: the sections rise in on the first visit of the session only.
  const firstEntrance = useFirstEntrance('trainer-today');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [zone] = useState(deviceTimeZone);
  const editor = useBookingEditor();
  const status = trpc.trainer.status.useQuery(undefined, { retry: false });
  const summary = trpc.trainer.dashboard.summary.useQuery({ today: localDate() });
  // Trainer mode M3 (§12): today's bookings' prescriptions are kept so Start works offline.
  useCoachPrefetch(todaysBookingsOf(summary.data));
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
  // Lane K4: opening Today is looking at the quiet clients — the Today badge starts over.
  const markQuietSeen = trpc.trainer.quiet.markSeen.useMutation({
    meta: { silent: true },
    onSuccess: () => void utils.trainer.badges.invalidate(),
  });
  const { mutate: markSeen } = markQuietSeen;
  const quietBadge = badges.quiet;
  useFocusEffect(
    useCallback(() => {
      if (quietBadge > 0) markSeen();
    }, [quietBadge, markSeen]),
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
  const today = todayIn(zone);
  const now = new Date();
  // M3 fields are additive: an M1/M2 server answers without them (no booking parts then).
  const hasBookings = d.nextBooking !== undefined;
  const addBooking = () =>
    editor.open({
      kind: 'new',
      prefill: { date: today, location: status.data?.gymLine ?? null },
    });

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
                <ListRow
                  testID="trainer-today-welcome-add-booking"
                  title={COPY.addBooking}
                  icon={<Icon name="schedule" color={colors.brand} />}
                  onPress={addBooking}
                />
              </ListSection>
            </View>
          ) : (
            <>
              {hasBookings ? (
                <NextBookingCard
                  next={d.nextBooking ?? null}
                  zone={zone}
                  today={today}
                  now={now}
                  onAdd={addBooking}
                />
              ) : null}
              <LaterToday bookings={d.todayBookings ?? []} zone={zone} today={today} />
              <WeekStats
                activeClients={d.activeClients}
                maxClients={d.maxClients}
                averageAdherence={d.averageAdherence}
                quietClients={d.quietClients.length}
                quietAfterDays={d.quietAfterDays}
                bookingsThisWeek={d.bookingsThisWeek}
              />
            </>
          )}

          {brandNew ? null : (
            <View testID="trainer-today-attention" className="gap-2">
              <Text accessibilityRole="header" className="text-title3 font-bold text-label">
                {COPY.needsAttention}
              </Text>
              <UnmarkedAttendance bookings={d.unmarkedAttendance ?? []} zone={zone} today={today} />
              {d.quietClients.map((client) => (
                <QuietClientRow
                  key={client.clientId}
                  client={client}
                  withFood={d.quietAfterDays !== undefined}
                />
              ))}
              <TrainerNotices />
              {d.quietClients.length === 0 &&
              noticeCount === 0 &&
              (d.unmarkedAttendance ?? []).length === 0 ? (
                <Text
                  testID="trainer-today-caught-up"
                  className="text-subhead text-label-secondary"
                >
                  {COPY.allCaughtUp}
                </Text>
              ) : null}
            </View>
          )}

          {brandNew ? null : <SessionsDelivered rows={d.sessionsDelivered ?? []} />}
        </Stagger>
      </KeyboardAwareScrollView>
      <InviteSheet visible={inviteOpen} onClose={() => setInviteOpen(false)} />
      {editor.sheet}
    </Screen>
  );
}
