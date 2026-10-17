import { useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { COACHING_COPY, type CoachingRequestDto } from '@chefer/types';
import {
  Button,
  ConfirmSheet,
  EmptyState,
  ErrorState,
  Screen,
  Text,
  useSnackbar,
  useThemeColors,
} from '@chefer/ui-mobile';
import { formatShortDay, userFacingErrorMessage } from '@chefer/utils';
import { Icon } from '../../../components/icon';
import { trpc } from '../../../lib/trpc';
import { useIsOnline } from '../../gym/workout/use-is-online';
import { useCoachingAvailability } from '../../trainer/api/use-coaching-availability';
import { CoachingCard } from '../../trainer/components/coaching-card';
import { TrainerHeader } from '../../trainer/components/trainer-header';
import { COACHING_MOBILE_COPY } from '../copy';

// ─── Profile → Your trainer (spec §2.3 step 5, §2.6) ──────────────────────────
// Who coaches you, since when, what they see and can do, and Leave; a pending coaching request (Cancel
// request) or, with neither, the way into Find a trainer (PRD 2026-10 §4.1). Mirrors the web card
// (apps/web/src/features/coaching/components/YourTrainerCard.tsx) line for line.

const EDGES: ('top' | 'bottom' | 'left' | 'right')[] = ['top', 'bottom', 'left', 'right'];

function Lines({ lines, testID }: { lines: readonly string[]; testID: string }) {
  return (
    <View className="gap-1.5">
      {lines.map((line, i) => (
        <View key={line} testID={`${testID}-${i}`} className="min-w-0 flex-row gap-2">
          <Text className="text-subhead text-label-secondary">•</Text>
          <Text className="min-w-0 flex-1 text-subhead text-label-secondary">{line}</Text>
        </View>
      ))}
    </View>
  );
}

/** The client's pending request (PRD 2026-10 §4.1): who, until when, and Cancel request. */
function PendingRequestCard({ request }: { request: CoachingRequestDto }) {
  const copy = COACHING_COPY.request;
  const utils = trpc.useUtils();
  const snackbar = useSnackbar();
  const cancel = trpc.coaching.cancelRequest.useMutation({
    meta: { silent: true },
    onSuccess: () => {
      snackbar.show({ message: copy.cancelled });
    },
    onSettled: () => {
      void utils.coaching.status.invalidate();
      void utils.coaching.trainerCard.invalidate();
    },
  });
  return (
    <CoachingCard testID="your-trainer-request" className="gap-2">
      <Text className="text-headline font-semibold text-label">
        {copy.pending(request.trainer.name)}
      </Text>
      <Text className="text-subhead text-label-secondary">
        {copy.expires(formatShortDay(request.expiresAt))}
      </Text>
      {cancel.error ? (
        <Text testID="your-trainer-request-error" className="text-subhead text-danger">
          {userFacingErrorMessage(cancel.error)}
        </Text>
      ) : null}
      <Button
        testID="your-trainer-request-cancel"
        variant="outline"
        loading={cancel.isPending}
        onPress={() => cancel.mutate(undefined)}
      >
        {copy.cancel}
      </Button>
    </CoachingCard>
  );
}

export function YourTrainerScreen() {
  const copy = COACHING_COPY.yourTrainer;
  const colors = useThemeColors();
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

  if (isLoading)
    return <Screen edges={EDGES} className="bg-canvas px-0" testID="your-trainer-loading" />;
  if (unreachable) {
    return (
      <Screen edges={EDGES} className="bg-canvas px-0">
        {header}
        <ErrorState testID="your-trainer-gate-error" onRetry={retry} />
      </Screen>
    );
  }
  if (!enabled) {
    return (
      <Screen edges={EDGES} className="bg-canvas px-0" testID="your-trainer-unavailable">
        {header}
        <EmptyState
          icon={<Icon name="yourTrainer" color={colors.labelTertiary} size={40} />}
          title={COACHING_MOBILE_COPY.unavailable}
        />
      </Screen>
    );
  }

  if (status.isPending) {
    return (
      <Screen edges={EDGES} className="bg-canvas px-0" testID="your-trainer-status-loading">
        {header}
        <View className="items-center py-16">
          <ActivityIndicator />
        </View>
      </Screen>
    );
  }
  if (status.isError) {
    return (
      <Screen edges={EDGES} className="bg-canvas px-0">
        {header}
        <ErrorState testID="your-trainer-error" onRetry={() => void status.refetch()} />
      </Screen>
    );
  }

  const { trainer, stopped } = status.data;
  // Additive (API 2026-10-17): the client's pending coaching request, from Find a trainer.
  const request = status.data.request ?? null;
  const leaveError = offlineError
    ? COACHING_MOBILE_COPY.offlineLeave
    : leave.error
      ? userFacingErrorMessage(leave.error)
      : null;

  return (
    <Screen edges={EDGES} className="bg-canvas px-0" testID="your-trainer">
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
        <CoachingCard className="gap-4">
          <View className="min-w-0 flex-row items-center gap-3">
            <View className="h-10 w-10 items-center justify-center rounded-full bg-brand-tint">
              <Icon name="yourTrainer" color={colors.brand} size={20} />
            </View>
            <Text
              testID="your-trainer-summary"
              className="min-w-0 flex-1 text-subhead text-label-secondary"
            >
              {trainer ? copy.since(trainer.name, formatShortDay(trainer.since)) : copy.noTrainer}
            </Text>
          </View>

          {trainer ? (
            <>
              <View className="gap-1.5">
                <Text accessibilityRole="header" className="text-subhead font-semibold text-label">
                  {copy.seesHeading(trainer.name)}
                </Text>
                <Lines lines={COACHING_COPY.consent.willSee} testID="your-trainer-sees" />
              </View>
              <View className="gap-1.5">
                <Text accessibilityRole="header" className="text-subhead font-semibold text-label">
                  {copy.canHeading(trainer.name)}
                </Text>
                <Lines lines={COACHING_COPY.consent.can(trainer.name)} testID="your-trainer-can" />
                <Text className="text-subhead text-label-secondary">
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
                <Text
                  testID="your-trainer-stopped"
                  className="text-subhead font-semibold text-label"
                >
                  {copy.stopped(stopped.trainerName)} · {formatShortDay(stopped.at)}
                </Text>
              ) : null}
              <Text testID="your-trainer-hint" className="text-subhead text-label-secondary">
                {copy.noTrainerHint}
              </Text>
            </View>
          )}
        </CoachingCard>

        {request ? (
          <PendingRequestCard request={request} />
        ) : trainer ? null : (
          // PRD 2026-10 §4.1: no trainer and nothing pending — find one by name.
          <CoachingCard testID="your-trainer-find" className="gap-2">
            <Text className="text-subhead text-label-secondary">
              {COACHING_COPY.find.entryHint}
            </Text>
            <Button testID="your-trainer-find-open" onPress={() => router.push('/coaching/find')}>
              {COACHING_COPY.find.entry}
            </Button>
          </CoachingCard>
        )}
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
