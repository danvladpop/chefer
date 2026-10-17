import { useState, type ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { COACHING_COPY } from '@chefer/types';
import {
  Button,
  EmptyState,
  ErrorState,
  KeyboardAwareScrollView,
  Screen,
  Text,
  useThemeColors,
} from '@chefer/ui-mobile';
import { userFacingErrorMessage } from '@chefer/utils';
import { Icon } from '../../../components/icon';
import { trpc } from '../../../lib/trpc';
import { useCoachingAvailability } from '../api/use-coaching-availability';
import { firstNameOf } from '../format';
import { CoachingCard } from './coaching-card';
import { TrainerFeedbackLink } from './trainer-feedback-link';
import { goBackOrHome, TRAINER_SCREEN_CLASS, TrainerHeader } from './trainer-header';
import { profileInput, TrainerProfileFields } from './trainer-profile-fields';

// ─── TrainerGate: every /trainer/* route renders inside it ────────────────────
// 1. `coaching.availability` (never gated) decides whether the feature exists for this user at all:
//    pending → blank (no flash, no `trainer.*` query), unreachable → Retry, off / not on the trainer
//    allowlist → "Trainer tools aren't available for your account yet." + Go back.
// 2. `trainer.status` decides whether trainer tools are on: off → the turn-on card (display name,
//    gym line, the findable note, "Turn on"), on → the screen. Children mount only once both said yes.

const SCREEN_EDGES: ('top' | 'bottom' | 'left' | 'right')[] = ['top', 'bottom', 'left', 'right'];

export function TrainerUnavailableScreen({ testID = 'trainer-unavailable' }: { testID?: string }) {
  const colors = useThemeColors();
  return (
    <Screen edges={SCREEN_EDGES} className="justify-center bg-canvas">
      <EmptyState
        testID={testID}
        icon={<Icon name="clients" color={colors.labelTertiary} size={40} />}
        title={COACHING_COPY.server.notAllowed}
        action={{ label: 'Go back', testID: `${testID}-back`, onPress: goBackOrHome }}
      />
    </Screen>
  );
}

function TurnOnScreen() {
  const utils = trpc.useUtils();
  const me = trpc.user.me.useQuery(undefined, { staleTime: 30_000 });
  const [name, setName] = useState<string | null>(null);
  const [gymLine, setGymLine] = useState('');
  const prefill = me.data?.name ? firstNameOf(me.data.name) : '';
  const draft = { displayName: name ?? prefill, gymLine };
  const activate = trpc.trainer.activate.useMutation({
    meta: { silent: true },
    onSuccess: (status) => {
      utils.trainer.status.setData(undefined, status);
    },
  });
  const input = profileInput(draft);
  const submit = () => {
    if (input.displayName === '' || activate.isPending) return;
    // An empty gym line is simply not sent (the field is optional and additive).
    activate.mutate(input.gymLine === null ? { displayName: input.displayName } : input);
  };

  return (
    <Screen edges={SCREEN_EDGES} className={TRAINER_SCREEN_CLASS} testID="trainer-turn-on">
      <TrainerHeader testID="trainer-turn-on-header" title={COACHING_COPY.trainer.title} />
      <KeyboardAwareScrollView contentContainerClassName="gap-4 px-4 py-4">
        <CoachingCard>
          <Text accessibilityRole="header" className="text-title3 font-bold text-label">
            {COACHING_COPY.trainer.turnOnTitle}
          </Text>
          <Text className="text-subhead text-label-secondary">
            {COACHING_COPY.trainer.turnOnBody}
          </Text>
          <TrainerProfileFields
            testID="trainer-turn-on"
            value={draft}
            onChange={(next) => {
              setName(next.displayName);
              setGymLine(next.gymLine);
            }}
            onSubmit={submit}
          />
          {/* PRD 2026-10 §4.1: turning on makes the trainer findable by name (a private Following profile). */}
          <Text testID="trainer-turn-on-findable" className="text-subhead text-label-secondary">
            {COACHING_COPY.trainerProfile.findableNote}
          </Text>
          {activate.error ? (
            <Text testID="trainer-turn-on-error" className="text-subhead text-danger">
              {userFacingErrorMessage(activate.error)}
            </Text>
          ) : null}
          <Button
            testID="trainer-turn-on-submit"
            loading={activate.isPending}
            disabled={input.displayName === ''}
            onPress={submit}
          >
            {COACHING_COPY.trainer.turnOn}
          </Button>
        </CoachingCard>
        <TrainerFeedbackLink />
      </KeyboardAwareScrollView>
    </Screen>
  );
}

function TrainerStatusGate({ children }: { children: ReactNode }) {
  const status = trpc.trainer.status.useQuery(undefined, { retry: false });
  if (status.isPending && status.fetchStatus === 'paused') {
    // Offline before the first answer: Retry, not an endless spinner.
    return (
      <Screen edges={SCREEN_EDGES} className="justify-center bg-canvas">
        <ErrorState testID="trainer-status-error" onRetry={() => void status.refetch()} />
      </Screen>
    );
  }
  if (status.isPending) {
    return (
      <Screen edges={SCREEN_EDGES} className="bg-canvas" testID="trainer-status-loading">
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      </Screen>
    );
  }
  if (status.isError) {
    return (
      <Screen edges={SCREEN_EDGES} className="justify-center bg-canvas">
        <ErrorState testID="trainer-status-error" onRetry={() => void status.refetch()} />
      </Screen>
    );
  }
  if (!status.data.active) return <TurnOnScreen />;
  return <>{children}</>;
}

export function TrainerGate({ children }: { children: ReactNode }) {
  const { enabled, canBeTrainer, isLoading, unreachable, retry } = useCoachingAvailability();
  if (isLoading) return <Screen className="bg-canvas" testID="trainer-gate-loading" />;
  if (unreachable) {
    return (
      <Screen edges={SCREEN_EDGES} className="justify-center bg-canvas">
        <ErrorState testID="trainer-gate-error" onRetry={retry} />
      </Screen>
    );
  }
  if (!enabled || !canBeTrainer) return <TrainerUnavailableScreen />;
  return <TrainerStatusGate>{children}</TrainerStatusGate>;
}
