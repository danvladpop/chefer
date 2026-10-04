import { useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { COACHING_COPY, COACHING_LIMITS, type ClientRowDto } from '@chefer/types';
import {
  Badge,
  Button,
  Card,
  ConfirmSheet,
  EmptyState,
  ErrorState,
  Screen,
  Text,
} from '@chefer/ui-mobile';
import { userFacingErrorMessage } from '@chefer/utils';
import { trpc } from '../../../lib/trpc';
import { localDate } from '../../gym/offline/ids';
import { formatStampDate } from '../../gym/routine/attribution';
import { TrainerHeader } from '../components/trainer-header';
import { firstNameOf, formatWeekdayDate } from '../format';

// ─── Trainer home: Clients (spec §2.4) ────────────────────────────────────────
// One row per active client: name, last workout, this week's sessions against the client's goal, a quiet
// flag after 7 days without a workout, and "Routine changed by Maria · 3 Oct" when the client edited
// after the trainer last did. Tap → the client. Below the list: turn trainer tools off.

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
  const quiet = row.inactiveDays >= COACHING_LIMITS.inactiveDays;
  return (
    <Pressable
      testID={`trainer-client-${row.clientId}`}
      accessibilityRole="button"
      accessibilityLabel={clientRowLabel(row)}
      onPress={() => router.push(`/trainer/${row.clientId}`)}
      className="min-h-14 gap-1 rounded-2xl border border-border bg-card px-4 py-3 active:bg-muted"
    >
      <View className="flex-row items-center gap-2">
        <Text className="min-w-0 flex-1 text-base font-semibold" numberOfLines={1}>
          {row.name}
        </Text>
        <Text variant="muted" className="text-sm">
          {COACHING_COPY.trainer.weekProgress(row.week.sessions, row.week.goal)}
        </Text>
        <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
      </View>
      {row.label ? (
        <Text variant="muted" className="min-w-0 text-xs" numberOfLines={1}>
          {row.label}
        </Text>
      ) : null}
      <Text variant="muted" className="min-w-0 text-sm">
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
          variant="muted"
          className="min-w-0 text-xs"
        >
          {COACHING_COPY.trainer.routineChangedByClient(
            firstNameOf(row.name),
            formatStampDate(row.routineChangedByClientAt),
          )}
        </Text>
      ) : null}
    </Pressable>
  );
}

export function TrainerHome() {
  const utils = trpc.useUtils();
  const clients = trpc.trainer.clients.list.useQuery({ today: localDate() });
  const [turnOffOpen, setTurnOffOpen] = useState(false);
  const deactivate = trpc.trainer.deactivate.useMutation({
    meta: { silent: true },
    onSuccess: () => {
      setTurnOffOpen(false);
      void utils.trainer.status.invalidate();
      void utils.trainer.clients.list.invalidate();
    },
  });

  return (
    <Screen edges={SCREEN_EDGES} className="px-0" testID="trainer-home">
      <TrainerHeader testID="trainer-home-header" title={COACHING_COPY.trainer.clients} />
      <ScrollView
        contentContainerClassName="gap-3 px-4 pb-8 pt-2"
        refreshControl={
          <RefreshControl
            refreshing={clients.isRefetching}
            onRefresh={() => void clients.refetch()}
          />
        }
      >
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
            icon={<Ionicons name="people-outline" size={40} color="#9ca3af" />}
            title={COACHING_COPY.trainer.clientsEmpty}
            description={COACHING_COPY.trainer.turnOnBody}
          />
        ) : (
          clients.data.map((row) => <ClientRow key={row.clientId} row={row} />)
        )}

        <Card className="mt-4 gap-2">
          <Text variant="muted" className="text-sm">
            {COACHING_COPY.trainer.turnOffBody}
          </Text>
          <Button
            testID="trainer-home-turn-off"
            variant="outline"
            onPress={() => setTurnOffOpen(true)}
          >
            {COACHING_COPY.trainer.turnOff}
          </Button>
        </Card>
      </ScrollView>

      <ConfirmSheet
        testID="trainer-home-turn-off-confirm"
        visible={turnOffOpen}
        onClose={() => setTurnOffOpen(false)}
        title={COACHING_COPY.trainer.turnOff}
        body={COACHING_COPY.trainer.turnOffBody}
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
