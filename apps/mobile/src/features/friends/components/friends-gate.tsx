import type { ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { FRIENDS_COPY } from '@chefer/types';
import { EmptyState, ErrorState, Screen } from '@chefer/ui-mobile';
import { useFriendsAvailability } from '../api/use-friends-availability';

// ─── FriendsGate: every /friends/* route renders inside it ────────────────────
// A route can be reached without an entry point (a stale deep link, the back
// stack after the kill switch). While `friends.availability` is pending the
// gate renders nothing (no flash, and the children's `friends.*` queries
// don't run); when it's off (or the API answered 4xx), the full-screen `Following isn’t
// available right now.` + `Go back` (UX §5.2). Children mount only once
// the server said yes.

export function FriendsUnavailableScreen({ testID = 'friends-unavailable' }: { testID?: string }) {
  return (
    <Screen className="justify-center">
      <EmptyState
        testID={testID}
        icon={<Ionicons name="people-outline" size={40} color="#9ca3af" />}
        title={FRIENDS_COPY.unavailable}
        action={{
          label: FRIENDS_COPY.common.goBack,
          testID: `${testID}-back`,
          onPress: () => (router.canGoBack() ? router.back() : router.replace('/')),
        }}
      />
    </Screen>
  );
}

export function FriendsGate({ children }: { children: ReactNode }) {
  const { enabled, isLoading, unreachable, retry } = useFriendsAvailability();
  if (isLoading) return <Screen testID="friends-gate-loading" />;
  // UX-X-12: could not ask is not the same as "off" — offer a retry.
  if (unreachable) {
    return (
      <Screen className="justify-center">
        <ErrorState testID="friends-gate-error" onRetry={retry} />
      </Screen>
    );
  }
  if (!enabled) return <FriendsUnavailableScreen />;
  return <>{children}</>;
}
