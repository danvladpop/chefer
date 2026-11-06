import { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import type { CoachingRequestDto } from '@chefer/types';
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
import { userFacingErrorMessage } from '@chefer/utils';
import { Icon } from '../../../components/icon';
import { useT } from '../../../lib/i18n';
import { trpc } from '../../../lib/trpc';
import { useIsOnline } from '../../gym/workout/use-is-online';
import { useCoachingAvailability } from '../../trainer/api/use-coaching-availability';
import { CoachingCard } from '../../trainer/components/coaching-card';
import { TrainerHeader } from '../../trainer/components/trainer-header';
import { UpcomingBookingsList } from '../bookings/upcoming-booking';
import {
  consentCanLines,
  consentWillSeeLines,
  formatShortDayT,
  trainerNameOrFallbackT,
} from '../copy';
import { ConsentUpdateNotice } from '../notices/consent-update-notice';
import { SharingCard } from '../sharing/sharing-card';

// ─── Profile → Your trainer (spec §2.3 step 5, §2.6) ──────────────────────────
// Who coaches you, since when, what they see and can do, and Leave; a pending coaching request (Cancel
// request) or, with neither, the way into Find a trainer (PRD 2026-10 §4.1). Mirrors the web card
// (apps/web/src/features/coaching/components/YourTrainerCard.tsx) line for line.
// Trainer mode M3 (§6.9, §10): the one-time "What's new with Ana" notice (its Leave opens the same
// confirmation; `openLeave` opens it on arrival from Today/Train) and the read-only Upcoming bookings.

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
  const { t } = useT();
  const utils = trpc.useUtils();
  const snackbar = useSnackbar();
  const cancel = trpc.coaching.cancelRequest.useMutation({
    meta: { silent: true },
    onSuccess: () => {
      snackbar.show({ message: t('coaching.request.cancelled') });
    },
    onSettled: () => {
      void utils.coaching.status.invalidate();
      void utils.coaching.trainerCard.invalidate();
    },
  });
  return (
    <CoachingCard testID="your-trainer-request" className="gap-2">
      <Text className="text-headline font-semibold text-label">
        {t('coaching.request.pending', {
          trainer: trainerNameOrFallbackT(request.trainer.name, t),
        })}
      </Text>
      <Text className="text-subhead text-label-secondary">
        {t('coaching.request.expires', { date: formatShortDayT(request.expiresAt, t) })}
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
        {t('coaching.request.cancel')}
      </Button>
    </CoachingCard>
  );
}

export function YourTrainerScreen({ openLeave = false }: { openLeave?: boolean } = {}) {
  const { t } = useT();
  const colors = useThemeColors();
  const { enabled, isLoading, unreachable, retry } = useCoachingAvailability();
  const utils = trpc.useUtils();
  const online = useIsOnline();
  const snackbar = useSnackbar();
  const status = trpc.coaching.status.useQuery(undefined, { enabled, retry: false });
  // The trainer may have answered a request, or ended the coaching, since the last visit:
  // never show a cached "Waiting for Ana to answer" when the screen comes back into view.
  useFocusEffect(
    useCallback(() => {
      if (enabled) void utils.coaching.status.invalidate();
    }, [enabled, utils]),
  );
  const [confirming, setConfirming] = useState(openLeave);
  const [offlineError, setOfflineError] = useState(false);
  const leave = trpc.coaching.leave.useMutation({
    meta: { silent: true },
    onSuccess: () => {
      setConfirming(false);
      void utils.coaching.status.invalidate();
      void utils.gym.bootstrap.invalidate();
      snackbar.show({ message: t('coaching.yourTrainer.left') });
    },
  });

  const header = (
    <TrainerHeader testID="your-trainer-header" title={t('coaching.yourTrainer.title')} />
  );

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
          title={t('coaching.join.unavailable')}
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
  const trainerName = trainer ? trainerNameOrFallbackT(trainer.name, t) : '';
  const leaveError = offlineError
    ? t('coaching.join.offlineLeave')
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
        <ConsentUpdateNotice
          onLeave={() => {
            setOfflineError(false);
            leave.reset();
            setConfirming(true);
          }}
        />
        <CoachingCard className="gap-4">
          <View className="min-w-0 flex-row items-center gap-3">
            <View className="h-10 w-10 items-center justify-center rounded-full bg-brand-tint">
              <Icon name="yourTrainer" color={colors.brand} size={20} />
            </View>
            <Text
              testID="your-trainer-summary"
              className="min-w-0 flex-1 text-subhead text-label-secondary"
            >
              {trainer
                ? t('coaching.yourTrainer.since', {
                    trainer: trainerName,
                    date: formatShortDayT(trainer.since, t),
                  })
                : t('coaching.yourTrainer.noTrainer')}
            </Text>
          </View>

          {trainer ? (
            <>
              <View className="gap-1.5">
                <Text accessibilityRole="header" className="text-subhead font-semibold text-label">
                  {t('coaching.yourTrainer.seesHeading', { trainer: trainerName })}
                </Text>
                <Lines lines={consentWillSeeLines(t)} testID="your-trainer-sees" />
              </View>
              <View className="gap-1.5">
                <Text accessibilityRole="header" className="text-subhead font-semibold text-label">
                  {t('coaching.yourTrainer.canHeading', { trainer: trainerName })}
                </Text>
                <Lines lines={consentCanLines(trainerName, t)} testID="your-trainer-can" />
                <Text className="text-subhead text-label-secondary">
                  {t('coaching.consent.privateNotes', { trainer: trainerName })}
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
                {t('coaching.yourTrainer.leave')}
              </Button>
            </>
          ) : (
            <View className="gap-1">
              {stopped ? (
                <Text
                  testID="your-trainer-stopped"
                  className="text-subhead font-semibold text-label"
                >
                  {t('coaching.yourTrainer.stopped', {
                    trainer: trainerNameOrFallbackT(stopped.trainerName, t),
                  })}{' '}
                  · {formatShortDayT(stopped.at, t)}
                </Text>
              ) : null}
              <Text testID="your-trainer-hint" className="text-subhead text-label-secondary">
                {t('coaching.yourTrainer.noTrainerHint')}
              </Text>
            </View>
          )}
        </CoachingCard>

        {trainer ? <SharingCard trainerName={trainerName} sharing={trainer.sharing} /> : null}

        {trainer ? <UpcomingBookingsList /> : null}

        {request ? (
          <PendingRequestCard request={request} />
        ) : trainer ? null : (
          // PRD 2026-10 §4.1: no trainer and nothing pending — find one by name.
          <CoachingCard testID="your-trainer-find" className="gap-2">
            <Text className="text-subhead text-label-secondary">
              {t('coaching.find.entryHint')}
            </Text>
            <Button testID="your-trainer-find-open" onPress={() => router.push('/coaching/find')}>
              {t('coaching.find.entry')}
            </Button>
          </CoachingCard>
        )}
      </ScrollView>

      {trainer ? (
        <ConfirmSheet
          testID="your-trainer-leave-confirm"
          visible={confirming}
          onClose={() => setConfirming(false)}
          title={t('coaching.yourTrainer.leaveTitle', { trainer: trainerName })}
          body={t('coaching.yourTrainer.leaveBody', { trainer: trainerName })}
          confirmLabel={t('coaching.yourTrainer.leaveConfirm')}
          cancelLabel={t('coaching.common.cancel')}
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
