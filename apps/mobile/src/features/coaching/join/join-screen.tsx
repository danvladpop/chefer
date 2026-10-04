import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { COACHING_COPY, type InvitePreviewDto } from '@chefer/types';
import { Button, ErrorState, Screen, Text } from '@chefer/ui-mobile';
import { isNetworkError, isServerError, localDateStr, userFacingErrorMessage } from '@chefer/utils';
import { getToken, subscribe as subscribeToken } from '../../../lib/auth-store';
import { trpc } from '../../../lib/trpc';
import { useIsOnline } from '../../gym/workout/use-is-online';
import { goBackOrHome } from '../../trainer/components/trainer-header';
import { COACHING_MOBILE_COPY } from '../copy';
import { clearPendingJoin, rememberPendingJoin, setReturnAfterSignIn } from '../pending-join';
import { ConsentScreen } from './consent-screen';

// ─── coaching/join/<code> (spec §2.3) ─────────────────────────────────────────
// previewInvite -> consent screen -> join. Every invite state has copy (`COACHING_COPY.inviteState`).
// A client without gym setup is sent to the existing setup first; the code is kept on the device and
// Gym Today offers to carry on. A signed-out visitor signs in or registers first and is brought back
// (PendingJoinHost) — the route is reachable signed out for that reason.
// Reached through `chefer://coaching/join/<code>` (the invite page's "Open in the Chefer app") or the
// in-app links ("Carry on joining your trainer").

const EDGES: ('top' | 'bottom' | 'left' | 'right')[] = ['top', 'bottom', 'left', 'right'];

function Page({ children, testID }: { children: ReactNode; testID: string }) {
  return (
    <Screen edges={EDGES} className="px-0" testID={testID}>
      <View className="min-h-12 flex-row items-center px-2">
        <Button
          testID={`${testID}-back`}
          variant="ghost"
          size="icon"
          accessibilityLabel="Back"
          onPress={goBackOrHome}
        >
          <Ionicons name="arrow-back" size={20} color="#1f2937" />
        </Button>
      </View>
      {children}
    </Screen>
  );
}

function Message({
  title,
  body,
  testID,
  action,
}: {
  title: string;
  body: string;
  testID: string;
  action?: { label: string; testID: string; onPress: () => void };
}) {
  return (
    <Page testID={testID}>
      <View className="gap-3 px-4 pt-2">
        <Text accessibilityRole="header" variant="title">
          {title}
        </Text>
        <Text testID="coaching-invite-message" className="text-sm text-gray-700">
          {body}
        </Text>
        <Button
          testID={action?.testID ?? 'coaching-invite-go-gym'}
          className="mt-3"
          onPress={action?.onPress ?? (() => router.replace('/today'))}
        >
          {action?.label ?? COACHING_MOBILE_COPY.goToGym}
        </Button>
      </View>
    </Page>
  );
}

export function stateMessage(preview: InvitePreviewDto): string | null {
  const copy = COACHING_COPY.inviteState;
  switch (preview.state) {
    case 'OK':
      return null;
    case 'ALREADY_YOURS':
      return copy.ALREADY_YOURS(preview.trainerName ?? COACHING_COPY.yourTrainer.title);
    case 'EXPIRED':
    case 'USED':
    case 'REVOKED':
    case 'SELF':
    case 'NOT_FOUND':
      return copy[preview.state];
  }
}

/** Signed out: the preview needs an account, so sign in or create one first (the code is kept). */
function SignedOutJoin({ code }: { code: string }) {
  useEffect(() => {
    rememberPendingJoin(code);
    setReturnAfterSignIn(code);
  }, [code]);
  return (
    <Page testID="coaching-join-signed-out">
      <View className="gap-3 px-4 pt-2">
        <Text accessibilityRole="header" variant="title">
          {COACHING_MOBILE_COPY.signedOutTitle}
        </Text>
        <Text className="text-sm text-gray-700">{COACHING_MOBILE_COPY.signedOutBody}</Text>
        <Button
          testID="coaching-join-sign-in"
          className="mt-3"
          onPress={() => router.push('/login')}
        >
          {COACHING_MOBILE_COPY.signIn}
        </Button>
        <Button
          testID="coaching-join-register"
          variant="outline"
          onPress={() => router.push('/register')}
        >
          {COACHING_MOBILE_COPY.createAccount}
        </Button>
      </View>
    </Page>
  );
}

function JoinFlow({ code }: { code: string }) {
  const utils = trpc.useUtils();
  const online = useIsOnline();
  // Always fresh: the answer changes while the screen is away (gym setup done, link used), and a
  // cached "needs gym setup" would strand a client who just finished it.
  const preview = trpc.coaching.previewInvite.useQuery(
    { code },
    { retry: false, staleTime: 0, gcTime: 0, refetchOnMount: 'always' },
  );
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState<string | null>(null);
  const join = trpc.coaching.join.useMutation({
    meta: { silent: true },
    onSuccess: (status) => {
      clearPendingJoin();
      void utils.coaching.status.invalidate();
      void utils.gym.bootstrap.invalidate();
      setJoined(
        status.trainer?.name ?? preview.data?.trainerName ?? COACHING_COPY.yourTrainer.title,
      );
    },
    onError: (err) => setError(userFacingErrorMessage(err)),
  });

  // An answer that ends the invite (expired, used, own link…) leaves nothing to carry on.
  const terminal = preview.data !== undefined && preview.data.state !== 'OK';
  useEffect(() => {
    if (terminal) clearPendingJoin();
  }, [terminal]);

  if (joined) {
    return (
      <Page testID="coaching-joined">
        <View className="gap-3 px-4 pt-2">
          <Text testID="coaching-joined-title" accessibilityRole="header" variant="title">
            {COACHING_COPY.consent.joinedTitle(joined)}
          </Text>
          <Text className="text-sm text-gray-700">{COACHING_COPY.consent.oneTrainer(joined)}</Text>
          <Button
            testID="coaching-joined-routine"
            className="mt-3"
            onPress={() => router.replace('/routine')}
          >
            {COACHING_MOBILE_COPY.openMyRoutine}
          </Button>
          <Button
            testID="coaching-joined-your-trainer"
            variant="outline"
            onPress={() => router.replace('/coaching')}
          >
            {COACHING_COPY.yourTrainer.title}
          </Button>
        </View>
      </Page>
    );
  }

  if (preview.isPending && preview.fetchStatus !== 'paused') {
    return (
      <Page testID="coaching-join-loading">
        <View className="items-center py-16">
          <ActivityIndicator />
        </View>
      </Page>
    );
  }

  // Offline or a 5xx is not an answer about the code: Retry, not "invalid link". Any other failure (flag off,
  // a malformed code) reads like an unknown code: the API answers an off flag with the same NOT_FOUND.
  if (
    (preview.isPending && preview.fetchStatus === 'paused') ||
    (preview.isError && (isNetworkError(preview.error) || isServerError(preview.error)))
  ) {
    return (
      <Page testID="coaching-join-error">
        <ErrorState testID="coaching-join-error-state" onRetry={() => void preview.refetch()} />
      </Page>
    );
  }
  if (preview.isError || !preview.data) {
    return (
      <Message
        testID="coaching-join-invalid"
        title={COACHING_MOBILE_COPY.inviteTitle}
        body={COACHING_COPY.inviteState.NOT_FOUND}
      />
    );
  }

  const data = preview.data;
  const message = stateMessage(data);
  if (message !== null) {
    return (
      <Message
        testID={`coaching-join-${data.state.toLowerCase()}`}
        title={COACHING_MOBILE_COPY.inviteTitle}
        body={message}
      />
    );
  }

  const trainerName = data.trainerName ?? COACHING_COPY.yourTrainer.title;
  if (data.needsGymSetup) {
    return (
      <Page testID="coaching-join-needs-setup">
        <View className="gap-3 px-4 pt-2">
          <Text accessibilityRole="header" variant="title">
            {COACHING_COPY.consent.title(trainerName)}
          </Text>
          <Text testID="coaching-needs-setup-body" className="text-sm text-gray-700">
            {COACHING_COPY.consent.needsSetup}
          </Text>
          <Button
            testID="coaching-needs-setup-cta"
            className="mt-3"
            onPress={() => {
              rememberPendingJoin(code);
              router.push('/gym/setup');
            }}
          >
            {COACHING_MOBILE_COPY.setUpTraining}
          </Button>
        </View>
      </Page>
    );
  }

  return (
    <Page testID="coaching-join">
      <ConsentScreen
        trainerName={trainerName}
        currentTrainerName={data.currentTrainerName}
        busy={join.isPending}
        offline={!online}
        error={error}
        onAllow={() => {
          setError(null);
          // The device-local day anchors the trainer's 4-week window (not the server's UTC day).
          join.mutate({ code, localDate: localDateStr() });
        }}
        onDecline={() => {
          clearPendingJoin();
          goBackOrHome();
        }}
      />
    </Page>
  );
}

export function JoinScreen({ code }: { code: string }) {
  const token = useSyncExternalStore(subscribeToken, getToken);
  if (token === null) return <SignedOutJoin code={code} />;
  return <JoinFlow code={code} />;
}
