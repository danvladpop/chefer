import { useState } from 'react';
import { ActivityIndicator, RefreshControl, View } from 'react-native';
import { router } from 'expo-router';
import { COACHING_COPY, COACHING_LIMITS, type ClientRowDto } from '@chefer/types';
import {
  Badge,
  Button,
  ConfirmSheet,
  EmptyState,
  ErrorState,
  KeyboardAwareScrollView,
  PressableScale,
  Screen,
  Text,
  useThemeColors,
} from '@chefer/ui-mobile';
import { userFacingErrorMessage } from '@chefer/utils';
import { Icon } from '../../../components/icon';
import { trpc } from '../../../lib/trpc';
import { localDate } from '../../gym/offline/ids';
import { formatStampDate } from '../../gym/routine/attribution';
import { CoachingCard } from '../components/coaching-card';
import { TrainerFeedbackLink } from '../components/trainer-feedback-link';
import { TrainerHeader } from '../components/trainer-header';
import { firstNameOf, formatWeekdayDate } from '../format';
import { RequestsSection } from './requests-section';
import { TrainerNotices } from './trainer-notices';
import { TrainerProfileCard } from './trainer-profile-card';

// ─── Trainer home: Clients (spec §2.4) ────────────────────────────────────────
// One row per active client: name, last workout, this week's sessions against the client's goal, a quiet
// flag after 7 days without a workout, and "Routine changed by Maria · 3 Oct" when the client edited
// after the trainer last did. Tap → the client. Above the list: the trainer's notices and Requests
// (PRD 2026-10 §4.1–4.2); below it: the profile (name, gym line), turn trainer tools off, Send feedback.

const SCREEN_EDGES: ('top' | 'bottom' | 'left' | 'right')[] = ['top', 'bottom', 'left', 'right'];

export function clientRowLabel(row: ClientRowDto): string {
  const parts = [
    row.name,
    row.lastWorkoutDate
      ? COACHING_COPY.trainer.lastWorkout(formatWeekdayDate(row.lastWorkoutDate))
      : COACHING_COPY.trainer.noWorkoutYet,
    COACHING_COPY.trainer.weekProgress(row.week.sessions, row.week.goal),
  ];
  if (row.inactiveDays >= COACHING_LIMITS.inactiveDays) {
    parts.push(COACHING_COPY.trainer.quiet(row.inactiveDays));
  }
  return parts.join('. ');
}

function ClientRow({ row }: { row: ClientRowDto }) {
  const colors = useThemeColors();
  const quiet = row.inactiveDays >= COACHING_LIMITS.inactiveDays;
  return (
    // MO-01: a card-sized tap target scales on press.
    <PressableScale
      testID={`trainer-client-${row.clientId}`}
      accessibilityRole="button"
      accessibilityLabel={clientRowLabel(row)}
      onPress={() => router.push(`/trainer/${row.clientId}`)}
      className="min-h-14 gap-1 rounded-card border border-separator bg-surface px-4 py-3"
    >
      <View className="flex-row items-center gap-2">
        <Text className="min-w-0 flex-1 text-headline font-semibold text-label" numberOfLines={1}>
          {row.name}
        </Text>
        <Text className="text-subhead text-label-secondary">
          {COACHING_COPY.trainer.weekProgress(row.week.sessions, row.week.goal)}
        </Text>
        <Icon name="chevronRight" color={colors.labelTertiary} size={16} />
      </View>
      {row.label ? (
        <Text className="min-w-0 text-caption text-label-secondary" numberOfLines={1}>
          {row.label}
        </Text>
      ) : null}
      <Text className="min-w-0 text-subhead text-label-secondary">
        {row.lastWorkoutDate
          ? COACHING_COPY.trainer.lastWorkout(formatWeekdayDate(row.lastWorkoutDate))
          : COACHING_COPY.trainer.noWorkoutYet}
      </Text>
      {quiet ? (
        <View className="flex-row">
          <Badge testID={`trainer-client-${row.clientId}-quiet`} variant="warning">
            {COACHING_COPY.trainer.quiet(row.inactiveDays)}
          </Badge>
        </View>
      ) : null}
      {row.routineChangedByClientAt ? (
        <Text
          testID={`trainer-client-${row.clientId}-changed`}
          className="min-w-0 text-caption text-label-secondary"
        >
          {COACHING_COPY.trainer.routineChangedByClient(
            firstNameOf(row.name),
            formatStampDate(row.routineChangedByClientAt),
          )}
        </Text>
      ) : null}
    </PressableScale>
  );
}

export function TrainerHome() {
  const colors = useThemeColors();
  const utils = trpc.useUtils();
  const clients = trpc.trainer.clients.list.useQuery({ today: localDate() });
  const status = trpc.trainer.status.useQuery(undefined, { retry: false });
  const [turnOffOpen, setTurnOffOpen] = useState(false);
  // PRD 2026-10 §4.3: the confirmation names the client count first.
  const activeClients = status.data?.activeClients ?? clients.data?.length ?? 0;
  const turnOffBody =
    activeClients > 0
      ? `${COACHING_COPY.trainerProfile.turnOffWithClients(activeClients)} ${COACHING_COPY.trainer.turnOffBody}`
      : COACHING_COPY.trainer.turnOffBody;
  const deactivate = trpc.trainer.deactivate.useMutation({
    meta: { silent: true },
    onSuccess: () => {
      setTurnOffOpen(false);
      void utils.trainer.status.invalidate();
      void utils.trainer.clients.list.invalidate();
      void utils.trainer.requests.list.invalidate();
    },
  });

  return (
    <Screen edges={SCREEN_EDGES} className="bg-canvas px-0" testID="trainer-home">
      <TrainerHeader testID="trainer-home-header" title={COACHING_COPY.trainer.clients} />
      <KeyboardAwareScrollView
        testID="trainer-home-scroll"
        contentContainerClassName="gap-3 px-4 pb-8 pt-2"
        refreshControl={
          <RefreshControl
            refreshing={clients.isRefetching}
            onRefresh={() => {
              void clients.refetch();
              void utils.trainer.requests.list.invalidate();
              void utils.coaching.notices.invalidate();
            }}
          />
        }
      >
        {/* PRD 2026-10 §4.2: what clients did since the trainer last looked. */}
        <TrainerNotices />
        {/* PRD 2026-10 §4.1: coaching requests from Find a trainer. */}
        <RequestsSection />

        <Button testID="trainer-home-invite" onPress={() => router.push('/trainer/invite')}>
          {COACHING_COPY.trainer.invite}
        </Button>

        {clients.isPending ? (
          <View testID="trainer-home-loading" className="items-center py-10">
            <ActivityIndicator />
          </View>
        ) : clients.isError ? (
          <ErrorState testID="trainer-home-error" onRetry={() => void clients.refetch()} />
        ) : clients.data.length === 0 ? (
          <EmptyState
            testID="trainer-home-empty"
            icon={<Icon name="clients" color={colors.labelTertiary} size={40} />}
            title={COACHING_COPY.trainer.clientsEmpty}
            description={COACHING_COPY.trainer.turnOnBody}
          />
        ) : (
          clients.data.map((row) => <ClientRow key={row.clientId} row={row} />)
        )}

        <TrainerProfileCard />

        <CoachingCard className="mt-4 gap-2">
          <Text testID="trainer-home-turn-off-body" className="text-subhead text-label-secondary">
            {turnOffBody}
          </Text>
          <Button
            testID="trainer-home-turn-off"
            variant="outline"
            onPress={() => setTurnOffOpen(true)}
          >
            {COACHING_COPY.trainer.turnOff}
          </Button>
        </CoachingCard>
        <TrainerFeedbackLink />
      </KeyboardAwareScrollView>

      <ConfirmSheet
        testID="trainer-home-turn-off-confirm"
        visible={turnOffOpen}
        onClose={() => setTurnOffOpen(false)}
        title={COACHING_COPY.trainer.turnOff}
        body={turnOffBody}
        confirmLabel={COACHING_COPY.trainer.turnOff}
        cancelLabel={COACHING_COPY.common.cancel}
        destructive
        busy={deactivate.isPending}
        error={deactivate.error ? userFacingErrorMessage(deactivate.error) : null}
        onConfirm={() => deactivate.mutate()}
      />
    </Screen>
  );
}
