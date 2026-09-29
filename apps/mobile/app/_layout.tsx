import '../global.css';
import { useState } from 'react';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Snackbar } from '@chefer/ui-mobile';
import { AiConsentHost, AiConsentProvider } from '../src/features/ai-consent/ai-consent-provider';
import { TermsReacceptSheet } from '../src/features/auth/terms-reaccept-sheet';
import { useSession } from '../src/features/auth/use-session';
import { installQueryConnectivity } from '../src/features/gym/offline/connectivity';
import { GymSyncProvider } from '../src/features/gym/offline/gym-sync-provider';
import {
  applyGymQueryDefaults,
  createGymPersistOptions,
} from '../src/features/gym/offline/query-persistence';
import { useNotificationLinks } from '../src/features/notifications/use-notification-links';
import { PremiumHost } from '../src/features/premium/premium-host';
import { initAnalytics, track } from '../src/lib/analytics';
import { getTrpcUrl } from '../src/lib/api-url';
import { getToken } from '../src/lib/auth-store';
import { CURRENT_BUILD } from '../src/lib/current-build';
import { makeQueryClient, trpc } from '../src/lib/trpc';
import { buildTrpcLinks } from '../src/lib/trpc-links';

// One line per launch so device logs (logcat / Console.app) show which
// bundle is live — embedded or which OTA update — without signing in.
// (info, not warn: warn would raise a LogBox toast in dev builds.)
// eslint-disable-next-line no-console
console.info(`[chefer] ${CURRENT_BUILD}`);

// NetInfo → onlineManager, AppState → focusManager (gym offline layer, §5.2).
installQueryConnectivity();

// Usage analytics (T-12.2, §5.10): starts the JS transport's 30s flush timer
// and background-flush listener. A no-op when no PostHog key is configured.
initAnalytics();
track('app_opened', {});

// Catches render errors in every route; see root-error-boundary.tsx.
export { RootErrorBoundary as ErrorBoundary } from '../src/components/root-error-boundary';

function createAppQueryClient() {
  const client = makeQueryClient();
  applyGymQueryDefaults(client);
  return client;
}

export default function RootLayout() {
  const { ready, token } = useSession();
  // Weekly plan / recap notification taps → the plan or Progress (P2-5).
  useNotificationLinks(ready && token !== null);

  const [queryClient] = useState(createAppQueryClient);
  // Only gym.* queries are persisted (offline read model) — see query-persistence.ts.
  const [persistOptions] = useState(createGymPersistOptions);
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: buildTrpcLinks({
        url: getTrpcUrl(),
        getToken,
        enableLogger: __DEV__,
      }),
    }),
  );

  if (!ready) {
    // SecureStore read is in flight — keep the splash frame, don't flash login.
    return null;
  }

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
        <GymSyncProvider token={token}>
          {/* AI data consent guard (App Store 5.1.2(i)) for every AI action. */}
          <AiConsentProvider signedIn={token !== null}>
            {/* Dark icons: the app is light-only (dark mode deferred) — "auto" drew
              white icons on a white screen when the phone is in dark mode. */}
            <StatusBar style="dark" />
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Protected guard={token !== null}>
                {/* Food / Gym mode (gym_plan.md D3): two tab groups at the root;
                the persisted mode picks which one "/" opens. */}
                <Stack.Screen name="(food)" />
                <Stack.Screen name="(gym)" />
                <Stack.Screen name="recipe/[id]" />
                <Stack.Screen name="tracker" />
                <Stack.Screen name="pantry" />
                <Stack.Screen name="profile" />
                <Stack.Screen name="preferences" />
                <Stack.Screen name="settings/index" />
                <Stack.Screen name="chat" />
                <Stack.Screen name="history/index" />
                <Stack.Screen name="history/[planId]" />
                <Stack.Screen name="progress" />
                <Stack.Screen name="onboarding" />
                <Stack.Screen name="cook/[id]" />
                <Stack.Screen name="import-recipe" />
                <Stack.Screen name="household" />
                <Stack.Screen name="my-weeks" />
                <Stack.Screen name="recipe-form" />
                {/* Gym stack routes (placeholders until wave G2 fills them). */}
                <Stack.Screen name="gym/setup" />
                <Stack.Screen
                  name="gym/workout"
                  // A card, not a fullScreenModal: safe-area insets read 0 inside iOS native
                  // modals, which put the header + Finish under the status bar.
                  options={{ animation: 'slide_from_bottom', gestureEnabled: false }}
                />
                <Stack.Screen name="gym/summary/[id]" options={{ gestureEnabled: false }} />
                <Stack.Screen name="gym/session/[id]" />
                <Stack.Screen name="gym/routine-editor" />
                <Stack.Screen name="gym/routines" />
                <Stack.Screen name="gym/exercise/[id]" />
                <Stack.Screen name="gym/exercise-form" />
                <Stack.Screen name="gym/settings" />
              </Stack.Protected>
              <Stack.Protected guard={token === null}>
                <Stack.Screen name="(auth)" />
              </Stack.Protected>
              {/* T-39.1: the in-app legal screen — unguarded, reachable both
                  from Register (signed out) and Settings/More (signed in). */}
              <Stack.Screen name="legal/[doc]" />
            </Stack>
            <AiConsentHost />
            {/* T-10.2: renders the job-led premium sheet for openPremium(source). */}
            <PremiumHost />
            {/* T-39.1: re-accept sheet for an existing account whose stored
                Terms/Privacy acceptance predates a document version bump. */}
            <TermsReacceptSheet signedIn={token !== null} />
            {/* PAT-4 (T-00.2): one snackbar host for the whole app, mounted
              above the tab bar so it never sits under it. */}
            <Snackbar />
          </AiConsentProvider>
        </GymSyncProvider>
      </PersistQueryClientProvider>
    </trpc.Provider>
  );
}
