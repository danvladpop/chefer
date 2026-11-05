import { useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import {
  NO_COACHING_SHARE as NO_SHARE,
  type CoachingShareChoice,
  type TrainerCardDto,
} from '@chefer/types';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Screen,
  Text,
  useSnackbar,
  useThemeColors,
} from '@chefer/ui-mobile';
import { isNetworkError, isServerError, localDateStr, userFacingErrorMessage } from '@chefer/utils';
import { Icon } from '../../../components/icon';
import { track } from '../../../lib/analytics';
import { trackSharingChosen } from '../../../lib/analytics-events';
import { useT } from '../../../lib/i18n';
import { trpc } from '../../../lib/trpc';
import { useIsOnline } from '../../gym/workout/use-is-online';
import { CoachingCard } from '../../trainer/components/coaching-card';
import { TRAINER_SCREEN_CLASS, TrainerHeader } from '../../trainer/components/trainer-header';
import { trainerNameOrFallbackT } from '../copy';
import { ConsentScreen } from '../join/consent-screen';
import { COACHING_EDGES, CoachingGate } from './coaching-gate';

// ─── A trainer's card (PRD 2026-10 §4.1) ──────────────────────────────────────
// `coaching.trainerCard`: name, the "Trainer" badge, the gym line, "Chefer does not verify trainers’
// credentials.", then what the viewer can do:
// - YOUR_TRAINER → "Ana is your trainer.";
// - REQUESTED → "Waiting for Ana to answer" + Cancel request;
// - NONE → "Ask to coach me", unless the trainer is full ("Not taking new clients"), another request is
//   pending ("You already asked Mihai. Cancel that request first.") or gym setup must run first.
// "Ask to coach me" opens the COACHING_SHARING consent (the invite's legal lines, request wording) and
// sends `coaching.requestCoaching` with the device-local day. A trainer who is not findable (or the flag
// off) answers NOT_FOUND: "This trainer isn’t available".

function TrainerActions({ card, onAsk }: { card: TrainerCardDto; onAsk: () => void }) {
  const { t } = useT();
  const trainer = trainerNameOrFallbackT(card.name, t);
  const utils = trpc.useUtils();
  const snackbar = useSnackbar();
  const cancel = trpc.coaching.cancelRequest.useMutation({
    meta: { silent: true },
    onSuccess: () => snackbar.show({ message: t('coaching.request.cancelled') }),
    onSettled: () => {
      void utils.coaching.trainerCard.invalidate();
      void utils.coaching.status.invalidate();
    },
  });

  if (card.relation === 'YOUR_TRAINER') {
    return (
      <Text testID="coaching-trainer-yours" className="text-subhead font-semibold text-label">
        {t('coaching.request.yourTrainer', { trainer })}
      </Text>
    );
  }
  if (card.relation === 'REQUESTED') {
    return (
      <View className="gap-2">
        <Text testID="coaching-trainer-pending" className="text-subhead font-semibold text-label">
          {t('coaching.request.pending', { trainer })}
        </Text>
        {cancel.error ? (
          <Text className="text-subhead text-danger">{userFacingErrorMessage(cancel.error)}</Text>
        ) : null}
        <Button
          testID="coaching-trainer-cancel"
          variant="outline"
          loading={cancel.isPending}
          onPress={() => cancel.mutate(undefined)}
        >
          {t('coaching.request.cancel')}
        </Button>
      </View>
    );
  }
  if (!card.acceptingClients) {
    return (
      <Text testID="coaching-trainer-not-taking" className="text-subhead text-label-secondary">
        {t('coaching.find.notTaking')}
      </Text>
    );
  }
  if (card.pendingRequestTo) {
    return (
      <Text testID="coaching-trainer-other-pending" className="text-subhead text-label-secondary">
        {t('coaching.request.otherPending', {
          trainer: trainerNameOrFallbackT(card.pendingRequestTo, t),
        })}
      </Text>
    );
  }
  if (card.needsGymSetup) {
    // Same as the invite join: the engine needs the client's equipment before a trainer can plan.
    return (
      <View className="gap-2">
        <Text testID="coaching-trainer-needs-setup" className="text-subhead text-label-secondary">
          {t('coaching.consent.needsSetup')}
        </Text>
        <Button testID="coaching-trainer-setup" onPress={() => router.push('/gym/setup')}>
          {t('coaching.join.setUpTraining')}
        </Button>
      </View>
    );
  }
  return (
    <Button testID="coaching-trainer-ask" onPress={onAsk}>
      {t('coaching.request.ask')}
    </Button>
  );
}

function TrainerCardBody({ trainerId }: { trainerId: string }) {
  const { t } = useT();
  const colors = useThemeColors();
  const utils = trpc.useUtils();
  const snackbar = useSnackbar();
  const online = useIsOnline();
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Lane K1: both off until the client turns them on on the consent screen.
  const [share, setShare] = useState<CoachingShareChoice>(NO_SHARE);
  const card = trpc.coaching.trainerCard.useQuery({ trainerId }, { retry: false });
  const send = trpc.coaching.requestCoaching.useMutation({
    meta: { silent: true },
    onSuccess: (_request, vars) => {
      track('coaching_requested', {});
      trackSharingChosen(vars.share, 'request');
      setAsking(false);
      snackbar.show({
        message: t('coaching.request.sent', {
          trainer: card.data?.name ? trainerNameOrFallbackT(card.data.name, t) : '',
        }),
      });
    },
    onError: (err) => setError(userFacingErrorMessage(err)),
    onSettled: () => {
      void utils.coaching.trainerCard.invalidate({ trainerId });
      void utils.coaching.status.invalidate();
    },
  });

  const title = card.data?.name ?? t('coaching.find.title');
  const header = (
    <TrainerHeader
      testID="coaching-trainer-header"
      title={title}
      {...(asking ? { onBack: () => setAsking(false) } : {})}
    />
  );

  if (card.isPending) {
    return (
      <Screen
        edges={COACHING_EDGES}
        className={TRAINER_SCREEN_CLASS}
        testID="coaching-trainer-loading"
      >
        {header}
        <View className="items-center py-16">
          <ActivityIndicator />
        </View>
      </Screen>
    );
  }
  if (card.isError) {
    const retryable = isNetworkError(card.error) || isServerError(card.error);
    return (
      <Screen
        edges={COACHING_EDGES}
        className={TRAINER_SCREEN_CLASS}
        testID="coaching-trainer-unavailable"
      >
        {header}
        {/* Offline or a 5xx is not an answer: Retry. NOT_FOUND (or a malformed id) means not findable. */}
        {retryable ? (
          <ErrorState testID="coaching-trainer-error" onRetry={() => void card.refetch()} />
        ) : (
          <EmptyState
            icon={<Icon name="yourTrainer" color={colors.labelTertiary} size={40} />}
            title={t('coaching.find.unavailable')}
          />
        )}
      </Screen>
    );
  }

  const data = card.data;
  if (asking) {
    return (
      <Screen
        edges={COACHING_EDGES}
        className={TRAINER_SCREEN_CLASS}
        testID="coaching-trainer-ask-consent"
      >
        {header}
        <ConsentScreen
          mode="request"
          trainerName={trainerNameOrFallbackT(data.name, t)}
          currentTrainerName={data.currentTrainerName}
          busy={send.isPending}
          offline={!online}
          error={error}
          onAllow={() => {
            setError(null);
            // The device-local day anchors the coaching's start if the trainer accepts (as the join does).
            send.mutate({ trainerId, localDate: localDateStr(), share });
          }}
          share={share}
          onShareChange={(next) => setShare((cur) => ({ ...cur, ...next }))}
          onDecline={() => {
            setError(null);
            setAsking(false);
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen edges={COACHING_EDGES} className={TRAINER_SCREEN_CLASS} testID="coaching-trainer">
      {header}
      <ScrollView contentContainerClassName="gap-4 px-4 pb-8 pt-2">
        <CoachingCard className="gap-3">
          <View className="flex-row flex-wrap items-center gap-2">
            <Badge testID="coaching-trainer-badge" variant="secondary">
              {t('coaching.find.badge')}
            </Badge>
            {data.gymLine ? (
              <Text testID="coaching-trainer-gym" className="text-subhead text-label-secondary">
                {data.gymLine}
              </Text>
            ) : null}
          </View>
          <TrainerActions
            card={data}
            onAsk={() => {
              setError(null);
              setAsking(true);
            }}
          />
          <Text testID="coaching-trainer-unverified" className="text-caption text-label-tertiary">
            {t('coaching.find.unverified')}
          </Text>
        </CoachingCard>
      </ScrollView>
    </Screen>
  );
}

export function TrainerCardScreen({ trainerId }: { trainerId: string }) {
  const { t } = useT();
  return (
    <CoachingGate testID="coaching-trainer" title={t('coaching.find.title')}>
      <TrainerCardBody trainerId={trainerId} />
    </CoachingGate>
  );
}
