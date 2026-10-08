import '../global.css';
import { useState } from 'react';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Snackbar } from '@chefer/ui-mobile';
import { AiConsentHost, AiConsentProvider } from '../src/features/ai-consent/ai-consent-provider';
import { markSessionExpired, setUnauthorizedHandler } from '../src/features/auth/session-expired';
import { TermsReacceptSheet } from '../src/features/auth/terms-reaccept-sheet';
import { useSession } from '../src/features/auth/use-session';
import { installQueryConnectivity } from '../src/features/gym/offline/connectivity';
import { GymSyncProvider } from '../src/features/gym/offline/gym-sync-provider';
import {
  applyGymQueryDefaults,
  createGymPersistOptions,
} from '../src/features/gym/offline/query-persistence';
import { ForegroundLandingHost } from '../src/features/navigation/foreground-landing-host';
import { FoodNudgeHost } from '../src/features/notifications/use-food-nudges';
import { useNotificationLinks } from '../src/features/notifications/use-notification-links';
import { NumbersModeHost } from '../src/features/numbers-mode/numbers-mode';
import { PremiumHost } from '../src/features/premium/premium-host';
import { HealthConsentLaunchPrompt } from '../src/features/privacy/health-consent-launch-prompt';
import { initAnalytics, track } from '../src/lib/analytics';
import { getTrpcUrl } from '../src/lib/api-url';
import { getToken } from '../src/lib/auth-store';
import { CURRENT_BUILD } from '../src/lib/current-build';
import { signOut } from '../src/lib/sign-out';
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

// UX-ACC-02 / UX-ACC-10: every 401 — tRPC, the chat stream, photo upload and
// scan alike — runs the full sign-out and leaves a "session expired" note for
// the sign-in screen. The user did not choose to leave, so unsynced gym
// workouts are kept for the next login.
function endExpiredSession() {
  // A 401 with nobody signed in (wrong password) is not an expired session.
  if (getToken() === null) return;
  markSessionExpired();
  void signOut({ reason: 'session-expired' });
}
setUnauthorizedHandler(endExpiredSession);

function createAppQueryClient() {
  const client = makeQueryClient({ onUnauthorized: endExpiredSession });
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
            {/* WP-08: one numbers-mode source (protein-only) for every screen below. */}
            <NumbersModeHost signedIn={token !== null}>
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
                  {/* Following (code name `friends`, docs/friends/ux-design.md §2.2).
                    Every screen gates itself on `friends.availability`
                    (FriendsGate): reached while the feature is off, it shows
                    "Following isn’t available right now." */}
                  <Stack.Screen name="friends/index" />
                  <Stack.Screen name="friends/requests" />
                  <Stack.Screen name="friends/activity" />
                  <Stack.Screen name="friends/settings" />
                  <Stack.Screen name="friends/blocked" />
                  <Stack.Screen name="friends/suggestions" />
                  <Stack.Screen name="friends/[userId]" />
                </Stack.Protected>
                <Stack.Protected guard={token === null}>
                  <Stack.Screen name="(auth)" />
                </Stack.Protected>
                {/* T-39.1: the in-app legal screen — unguarded, reachable both
                  from Register (signed out) and Settings/More (signed in). */}
                <Stack.Screen name="legal/[doc]" />
              </Stack>
            </NumbersModeHost>
            <AiConsentHost />
            {/* UX-PO-08: keeps the opt-in dinner / plan-Sunday nudges scheduled. */}
            <FoodNudgeHost signedIn={token !== null} />
            {/* UX-PO-10: after 30 min in the background, a foreground re-lands (food/gym). */}
            <ForegroundLandingHost signedIn={token !== null} />
            {/* UX-26, Q-7 (pending counsel): data saved before health consent existed
                is kept; the signed-in user is asked once per launch. */}
            <HealthConsentLaunchPrompt signedIn={token !== null} />
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
