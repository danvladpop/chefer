import { useState, type ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COACHING_COPY } from '@chefer/types';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  FormField,
  Input,
  KeyboardAwareScrollView,
  Screen,
  Text,
} from '@chefer/ui-mobile';
import { userFacingErrorMessage } from '@chefer/utils';
import { trpc } from '../../../lib/trpc';
import { useCoachingAvailability } from '../api/use-coaching-availability';
import { firstNameOf } from '../format';
import { goBackOrHome, TrainerHeader } from './trainer-header';

// ─── TrainerGate: every /trainer/* route renders inside it ────────────────────
// 1. `coaching.availability` (never gated) decides whether the feature exists for this user at all:
//    pending → blank (no flash, no `trainer.*` query), unreachable → Retry, off / not on the trainer
//    allowlist → "Trainer tools aren't available for your account yet." + Go back.
// 2. `trainer.status` decides whether trainer tools are on: off → the turn-on card (display name,
//    "Turn on"), on → the screen. Children mount only once both said yes.

const SCREEN_EDGES: ('top' | 'bottom' | 'left' | 'right')[] = ['top', 'bottom', 'left', 'right'];

export function TrainerUnavailableScreen({ testID = 'trainer-unavailable' }: { testID?: string }) {
  return (
    <Screen edges={SCREEN_EDGES} className="justify-center">
      <EmptyState
        testID={testID}
        icon={<Ionicons name="people-outline" size={40} color="#9ca3af" />}
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
  const prefill = me.data?.name ? firstNameOf(me.data.name) : '';
  const displayName = name ?? prefill;
  const activate = trpc.trainer.activate.useMutation({
    meta: { silent: true },
    onSuccess: (status) => {
      utils.trainer.status.setData(undefined, status);
    },
  });
  const trimmed = displayName.trim();

  return (
    <Screen edges={SCREEN_EDGES} className="px-0" testID="trainer-turn-on">
      <TrainerHeader testID="trainer-turn-on-header" title={COACHING_COPY.trainer.title} />
      <KeyboardAwareScrollView contentContainerClassName="gap-4 px-4 py-4">
        <Card>
          <Text variant="heading">{COACHING_COPY.trainer.turnOnTitle}</Text>
          <Text variant="muted" className="mt-1">
            {COACHING_COPY.trainer.turnOnBody}
          </Text>
          <View className="mt-4">
            <FormField
              label={COACHING_COPY.trainer.displayName}
              testID="trainer-turn-on-name-field"
            >
              <Input
                testID="trainer-turn-on-name"
                label={COACHING_COPY.trainer.displayName}
                value={displayName}
                maxLength={40}
                autoCapitalize="words"
                returnKeyType="done"
                onChangeText={setName}
              />
            </FormField>
          </View>
          {activate.error ? (
            <Text testID="trainer-turn-on-error" className="mt-2 text-sm text-destructive">
              {userFacingErrorMessage(activate.error)}
            </Text>
          ) : null}
          <Button
            testID="trainer-turn-on-submit"
            className="mt-4"
            loading={activate.isPending}
            disabled={trimmed === ''}
            onPress={() => activate.mutate({ displayName: trimmed })}
          >
            {COACHING_COPY.trainer.turnOn}
          </Button>
        </Card>
      </KeyboardAwareScrollView>
    </Screen>
  );
}

function TrainerStatusGate({ children }: { children: ReactNode }) {
  const status = trpc.trainer.status.useQuery(undefined, { retry: false });
  if (status.isPending && status.fetchStatus === 'paused') {
    // Offline before the first answer: Retry, not an endless spinner.
    return (
      <Screen edges={SCREEN_EDGES} className="justify-center">
        <ErrorState testID="trainer-status-error" onRetry={() => void status.refetch()} />
      </Screen>
    );
  }
  if (status.isPending) {
    return (
      <Screen edges={SCREEN_EDGES} testID="trainer-status-loading">
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      </Screen>
    );
  }
  if (status.isError) {
    return (
      <Screen edges={SCREEN_EDGES} className="justify-center">
        <ErrorState testID="trainer-status-error" onRetry={() => void status.refetch()} />
      </Screen>
    );
  }
  if (!status.data.active) return <TurnOnScreen />;
  return <>{children}</>;
}

export function TrainerGate({ children }: { children: ReactNode }) {
  const { enabled, canBeTrainer, isLoading, unreachable, retry } = useCoachingAvailability();
  if (isLoading) return <Screen testID="trainer-gate-loading" />;
  if (unreachable) {
    return (
      <Screen edges={SCREEN_EDGES} className="justify-center">
        <ErrorState testID="trainer-gate-error" onRetry={retry} />
      </Screen>
    );
  }
  if (!enabled || !canBeTrainer) return <TrainerUnavailableScreen />;
  return <TrainerStatusGate>{children}</TrainerStatusGate>;
}
