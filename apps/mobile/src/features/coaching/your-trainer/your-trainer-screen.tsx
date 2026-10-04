import { useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COACHING_COPY } from '@chefer/types';
import {
  Button,
  Card,
  ConfirmSheet,
  EmptyState,
  ErrorState,
  Screen,
  Text,
  useSnackbar,
} from '@chefer/ui-mobile';
import { formatShortDay, userFacingErrorMessage } from '@chefer/utils';
import { trpc } from '../../../lib/trpc';
import { useIsOnline } from '../../gym/workout/use-is-online';
import { useCoachingAvailability } from '../../trainer/api/use-coaching-availability';
import { TrainerHeader } from '../../trainer/components/trainer-header';
import { COACHING_MOBILE_COPY } from '../copy';

// ─── Profile → Your trainer (spec §2.3 step 5, §2.6) ──────────────────────────
// Who coaches you, since when, what they see and can do, and Leave. Mirrors the web card
// (apps/web/src/features/coaching/components/YourTrainerCard.tsx) line for line.

const EDGES: ('top' | 'bottom' | 'left' | 'right')[] = ['top', 'bottom', 'left', 'right'];

function Lines({ lines, testID }: { lines: readonly string[]; testID: string }) {
  return (
    <View className="gap-1.5">
      {lines.map((line, i) => (
        <View key={line} testID={`${testID}-${i}`} className="min-w-0 flex-row gap-2">
          <Text className="text-sm text-gray-700">•</Text>
          <Text className="min-w-0 flex-1 text-sm text-gray-700">{line}</Text>
        </View>
      ))}
    </View>
  );
}

export function YourTrainerScreen() {
  const copy = COACHING_COPY.yourTrainer;
  const { enabled, isLoading, unreachable, retry } = useCoachingAvailability();
  const utils = trpc.useUtils();
  const online = useIsOnline();
  const snackbar = useSnackbar();
  const status = trpc.coaching.status.useQuery(undefined, { enabled, retry: false });
  const [confirming, setConfirming] = useState(false);
  const [offlineError, setOfflineError] = useState(false);
  const leave = trpc.coaching.leave.useMutation({
    meta: { silent: true },
    onSuccess: () => {
      setConfirming(false);
      void utils.coaching.status.invalidate();
      void utils.gym.bootstrap.invalidate();
      snackbar.show({ message: copy.left });
    },
  });

  const header = <TrainerHeader testID="your-trainer-header" title={copy.title} />;

  if (isLoading) return <Screen edges={EDGES} className="px-0" testID="your-trainer-loading" />;
  if (unreachable) {
    return (
      <Screen edges={EDGES} className="px-0">
        {header}
        <ErrorState testID="your-trainer-gate-error" onRetry={retry} />
      </Screen>
    );
  }
  if (!enabled) {
    return (
      <Screen edges={EDGES} className="px-0" testID="your-trainer-unavailable">
        {header}
        <EmptyState
          icon={<Ionicons name="person-outline" size={40} color="#9ca3af" />}
          title={COACHING_MOBILE_COPY.unavailable}
        />
      </Screen>
    );
  }

  if (status.isPending) {
    return (
      <Screen edges={EDGES} className="px-0" testID="your-trainer-status-loading">
        {header}
        <View className="items-center py-16">
          <ActivityIndicator />
        </View>
      </Screen>
    );
  }
  if (status.isError) {
    return (
      <Screen edges={EDGES} className="px-0">
        {header}
        <ErrorState testID="your-trainer-error" onRetry={() => void status.refetch()} />
      </Screen>
    );
  }

  const { trainer, stopped } = status.data;
  const leaveError = offlineError
    ? COACHING_MOBILE_COPY.offlineLeave
    : leave.error
      ? userFacingErrorMessage(leave.error)
      : null;

  return (
    <Screen edges={EDGES} className="px-0" testID="your-trainer">
      {header}
      <ScrollView
        contentContainerClassName="gap-4 px-4 pb-8 pt-2"
        refreshControl={
          <RefreshControl
            refreshing={status.isRefetching}
            onRefresh={() => void status.refetch()}
          />
        }
      >
        <Card className="gap-4">
          <View className="min-w-0 flex-row items-center gap-3">
            <View className="h-10 w-10 items-center justify-center rounded-full bg-[#fff3e8]">
              <Ionicons name="person-outline" size={20} color="#944a00" />
            </View>
            <Text testID="your-trainer-summary" className="min-w-0 flex-1 text-sm text-gray-700">
              {trainer ? copy.since(trainer.name, formatShortDay(trainer.since)) : copy.noTrainer}
            </Text>
          </View>

          {trainer ? (
            <>
              <View className="gap-1.5">
                <Text accessibilityRole="header" className="text-sm font-semibold">
                  {copy.seesHeading(trainer.name)}
                </Text>
                <Lines lines={COACHING_COPY.consent.willSee} testID="your-trainer-sees" />
              </View>
              <View className="gap-1.5">
                <Text accessibilityRole="header" className="text-sm font-semibold">
                  {copy.canHeading(trainer.name)}
                </Text>
                <Lines lines={COACHING_COPY.consent.can(trainer.name)} testID="your-trainer-can" />
                <Text className="text-sm text-gray-700">
                  {COACHING_COPY.consent.privateNotes(trainer.name)}
                </Text>
              </View>
              <Button
                testID="your-trainer-leave"
                variant="outline"
                onPress={() => {
                  setOfflineError(false);
                  leave.reset();
                  setConfirming(true);
                }}
              >
                {copy.leave}
              </Button>
            </>
          ) : (
            <View className="gap-1">
              {stopped ? (
                <Text testID="your-trainer-stopped" className="text-sm font-medium text-gray-800">
                  {copy.stopped(stopped.trainerName)} · {formatShortDay(stopped.at)}
                </Text>
              ) : null}
              <Text testID="your-trainer-hint" variant="muted" className="text-sm">
                {copy.noTrainerHint}
              </Text>
            </View>
          )}
        </Card>
      </ScrollView>

      {trainer ? (
        <ConfirmSheet
          testID="your-trainer-leave-confirm"
          visible={confirming}
          onClose={() => setConfirming(false)}
          title={copy.leaveTitle(trainer.name)}
          body={copy.leaveBody(trainer.name)}
          confirmLabel={copy.leaveConfirm}
          cancelLabel={COACHING_COPY.common.cancel}
          destructive
          busy={leave.isPending}
          error={leaveError}
          onConfirm={() => {
            if (!online) {
              setOfflineError(true);
              return;
            }
            setOfflineError(false);
            leave.mutate(undefined);
          }}
        />
      ) : null}
    </Screen>
  );
}
