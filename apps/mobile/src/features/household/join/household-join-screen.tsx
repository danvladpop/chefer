import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router } from 'expo-router';
import { HOUSEHOLD_SHARING_COPY, type HouseholdInvitePreview } from '@chefer/types';
import { Button, ErrorState, IconButton, Screen, Text, useThemeColors } from '@chefer/ui-mobile';
import { isNetworkError, isServerError, userFacingErrorMessage } from '@chefer/utils';
import { Icon } from '../../../components/icon';
import { useIsOnline } from '../../../hooks/use-is-online';
import { track } from '../../../lib/analytics';
import { getToken, subscribe as subscribeToken } from '../../../lib/auth-store';
import { trpc } from '../../../lib/trpc';
import { setReturnAfterSignIn } from '../../coaching/pending-join';
import { useHealthConsent } from '../../privacy/use-health-consent';
import { goBackOrHome } from '../../trainer/components/trainer-header';
import { HOUSEHOLD_MOBILE_COPY } from '../sharing/copy';
import {
  clearPendingHouseholdJoin,
  rememberPendingHouseholdJoin,
} from '../sharing/pending-household-join';
import { useInvalidateHousehold } from '../sharing/use-household-sharing';
import { HouseholdConsent, safetyEdited, type SafetyLists } from './household-consent';

// ─── household/join/<code> (ADR 0002, business_flow §17.1) ────────────────────
// The coaching invite pattern for households: previewInvite → the consent screen (what is shared, what
// stays private, the claimed profile's allergies / diet / dislikes to confirm or fix) → join. Every
// invite state has one shared sentence (`HOUSEHOLD_SHARING_COPY.inviteState`). A signed-out visitor
// signs in or registers first and PendingJoinHost brings them back (the code is kept on the device).
// Reached through `chefer://household/join/<code>` (the invite page's "Open in the Chefer app").

const EDGES: ('top' | 'bottom' | 'left' | 'right')[] = ['top', 'bottom', 'left', 'right'];

/** Codes first opened signed out this run, for `household_invite_opened.signedIn`. */
const openedSignedOut = new Set<string>();

function Page({ children, testID }: { children: ReactNode; testID: string }) {
  const colors = useThemeColors();
  return (
    <Screen edges={EDGES} className="bg-canvas px-0" testID={testID}>
      <View className="min-h-11 flex-row items-center px-4 py-2">
        <IconButton
          testID={`${testID}-back`}
          accessibilityLabel="Back"
          icon={<Icon name="chevronBack" color={colors.brand} size={26} />}
          onPress={goBackOrHome}
          className="-ml-2"
        />
      </View>
      {children}
    </Screen>
  );
}

function Message({ body, testID }: { body: string; testID: string }) {
  return (
    <Page testID={testID}>
      <View className="gap-3 px-4 pt-2">
        <Text accessibilityRole="header" className="text-title2 font-bold text-label">
          {HOUSEHOLD_SHARING_COPY.joinPageTitle}
        </Text>
        <Text testID="household-invite-message" className="text-subhead text-label-secondary">
          {body}
        </Text>
        <Button
          testID="household-invite-go-meals"
          className="mt-3"
          onPress={() => router.replace('/meal-plan')}
        >
          {HOUSEHOLD_MOBILE_COPY.goToMeals}
        </Button>
      </View>
    </Page>
  );
}

/** The one sentence for an invite that cannot be joined (null for OK). */
export function householdInviteMessage(preview: HouseholdInvitePreview): string | null {
  const copy = HOUSEHOLD_SHARING_COPY.inviteState;
  switch (preview.state) {
    case 'OK':
      return null;
    case 'IN_OTHER_HOUSEHOLD':
      return copy.IN_OTHER_HOUSEHOLD(preview.currentOwnerName ?? preview.ownerName ?? '');
    case 'NOT_FOUND':
    case 'SELF':
    case 'ALREADY_JOINED':
    case 'HAS_PARTNERS':
    case 'PROFILE_TAKEN':
    case 'USED':
    case 'REVOKED':
    case 'EXPIRED':
      return copy[preview.state];
  }
}

/** Signed out: the preview needs an account, so sign in or create one first (the code is kept). */
function SignedOutJoin({ code }: { code: string }) {
  useEffect(() => {
    openedSignedOut.add(code);
    rememberPendingHouseholdJoin(code);
    setReturnAfterSignIn(code, 'household');
  }, [code]);
  return (
    <Page testID="household-join-signed-out">
      <View className="gap-3 px-4 pt-2">
        <Text accessibilityRole="header" className="text-title2 font-bold text-label">
          {HOUSEHOLD_SHARING_COPY.joinPageTitle}
        </Text>
        <Text className="text-subhead text-label-secondary">
          {HOUSEHOLD_MOBILE_COPY.signedOutBody}
        </Text>
        <Button
          testID="household-join-sign-in"
          className="mt-3"
          onPress={() => router.push('/login')}
        >
          {HOUSEHOLD_MOBILE_COPY.signIn}
        </Button>
        <Button
          testID="household-join-register"
          variant="outline"
          onPress={() => router.push('/register')}
        >
          {HOUSEHOLD_MOBILE_COPY.createAccount}
        </Button>
      </View>
    </Page>
  );
}

const EMPTY_SAFETY: SafetyLists = {
  allergies: [],
  dietaryRestrictions: [],
  dislikedIngredients: [],
};

function JoinFlow({ code }: { code: string }) {
  const online = useIsOnline();
  const utils = trpc.useUtils();
  const invalidateHousehold = useInvalidateHousehold();
  const { requestHealthConsent, healthConsentSheet } = useHealthConsent();
  // Always fresh: the answer changes while the screen is away (the link used, the profile claimed).
  const preview = trpc.household.previewInvite.useQuery(
    { code },
    { retry: false, staleTime: 0, gcTime: 0, refetchOnMount: 'always' },
  );
  const [safety, setSafety] = useState<SafetyLists | null>(null);
  const [error, setError] = useState<string | null>(null);
  const consentRetried = useRef(false);

  const data = preview.data;
  const original: SafetyLists = data?.profile
    ? {
        allergies: data.profile.allergies,
        dietaryRestrictions: data.profile.dietaryRestrictions,
        dislikedIngredients: data.profile.dislikedIngredients,
      }
    : EMPTY_SAFETY;
  const confirmed = safety ?? original;

  // One `household_invite_opened` per answer; an answer that ends the invite leaves nothing to resume.
  const trackedState = useRef<string | null>(null);
  useEffect(() => {
    if (!data || trackedState.current === data.state) return;
    trackedState.current = data.state;
    track('household_invite_opened', { state: data.state, signedIn: !openedSignedOut.has(code) });
    if (data.state !== 'OK') clearPendingHouseholdJoin();
  }, [data, code]);

  const join = trpc.household.join.useMutation({
    meta: { silent: true },
    onSuccess: () => {
      clearPendingHouseholdJoin();
      track('household_joined', { editedSafety: safetyEdited(original, confirmed) });
      invalidateHousehold();
      router.replace('/meal-plan');
    },
    onError: (err) => {
      // The server had no health consent on record (a stale cache said yes): ask, then try once more.
      if (err.data?.healthConsentRequired === true && !consentRetried.current) {
        consentRetried.current = true;
        void utils.user.me.invalidate().then(() => submit());
        return;
      }
      setError(userFacingErrorMessage(err));
    },
  });

  const submit = () => {
    setError(null);
    const payload = { code, ...confirmed };
    requestHealthConsent(() => join.mutate(payload), {
      hasHealthData:
        payload.allergies.length +
          payload.dietaryRestrictions.length +
          payload.dislikedIngredients.length >
        0,
    });
  };

  if (preview.isPending && preview.fetchStatus !== 'paused') {
    return (
      <Page testID="household-join-loading">
        <View className="items-center py-16">
          <ActivityIndicator />
        </View>
      </Page>
    );
  }

  // Offline or a 5xx is not an answer about the code: Retry, not "invalid link". Any other failure (flag
  // off, a malformed code) reads like an unknown code.
  if (
    (preview.isPending && preview.fetchStatus === 'paused') ||
    (preview.isError && (isNetworkError(preview.error) || isServerError(preview.error)))
  ) {
    return (
      <Page testID="household-join-error">
        <ErrorState testID="household-join-error-state" onRetry={() => void preview.refetch()} />
      </Page>
    );
  }
  if (preview.isError || !data) {
    return (
      <Message
        testID="household-join-invalid"
        body={HOUSEHOLD_SHARING_COPY.inviteState.NOT_FOUND}
      />
    );
  }

  const message = householdInviteMessage(data);
  if (message !== null || !data.profile) {
    return (
      <Message
        testID={`household-join-${data.state.toLowerCase()}`}
        body={message ?? HOUSEHOLD_SHARING_COPY.inviteState.NOT_FOUND}
      />
    );
  }

  return (
    <Page testID="household-join">
      <HouseholdConsent
        ownerName={data.ownerName ?? ''}
        profileName={data.profile.name}
        portionFactor={data.profile.portionFactor}
        safety={confirmed}
        onSafetyChange={setSafety}
        busy={join.isPending}
        offline={!online}
        error={error}
        onJoin={() => {
          consentRetried.current = false;
          submit();
        }}
        onDecline={() => {
          clearPendingHouseholdJoin();
          goBackOrHome();
        }}
      />
      {healthConsentSheet}
    </Page>
  );
}

export function HouseholdJoinScreen({ code }: { code: string }) {
  const token = useSyncExternalStore(subscribeToken, getToken);
  if (token === null) return <SignedOutJoin code={code} />;
  return <JoinFlow code={code} />;
}
