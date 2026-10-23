import '../global.css';
import { useState } from 'react';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Snackbar, SnackbarTouchBoundary } from '@chefer/ui-mobile';
import { CrashReportingUserHost } from '../src/components/crash-reporting-user-host';
import { AiConsentHost, AiConsentProvider } from '../src/features/ai-consent/ai-consent-provider';
import { forceLightAppearance } from '../src/features/appearance/force-light';
import { markSessionExpired, setUnauthorizedHandler } from '../src/features/auth/session-expired';
import { TermsReacceptSheet } from '../src/features/auth/terms-reaccept-sheet';
import { useSession } from '../src/features/auth/use-session';
import { PendingJoinHost } from '../src/features/coaching/pending-join-host';
import { installQueryConnectivity } from '../src/features/gym/offline/connectivity';
import { GymSyncProvider } from '../src/features/gym/offline/gym-sync-provider';
import {
  applyGymQueryDefaults,
  createGymPersistOptions,
} from '../src/features/gym/offline/query-persistence';
import { LocaleSyncHost } from '../src/features/language/locale-sync-host';
import { ForegroundLandingHost } from '../src/features/navigation/foreground-landing-host';
import { BookingReminderHost } from '../src/features/notifications/use-booking-reminders';
import { FoodNudgeHost } from '../src/features/notifications/use-food-nudges';
import { useNotificationLinks } from '../src/features/notifications/use-notification-links';
import { NumbersModeHost } from '../src/features/numbers-mode/numbers-mode';
import { PremiumHost } from '../src/features/premium/premium-host';
import { HealthConsentLaunchPrompt } from '../src/features/privacy/health-consent-launch-prompt';
import { startReviewSession } from '../src/features/review/review-store';
import { ShellFlagHost } from '../src/features/shell/shell-flag-host';
import { TrainerModeHost } from '../src/features/trainer-mode/trainer-mode-host';
import { initAnalytics, track } from '../src/lib/analytics';
import { getTrpcUrl } from '../src/lib/api-url';
import { getToken } from '../src/lib/auth-store';
import { initCrashReporting } from '../src/lib/crash-reporting';
import { CURRENT_BUILD } from '../src/lib/current-build';
import { applyInitialOrientationLock, useOrientationLock } from '../src/lib/orientation-lock';
import { signOut } from '../src/lib/sign-out';
import { makeQueryClient, trpc } from '../src/lib/trpc';
import { buildTrpcLinks } from '../src/lib/trpc-links';

// M1-6: first thing at module scope, so a crash anywhere below is reported.
// Production builds with EXPO_PUBLIC_SENTRY_DSN only; a no-op otherwise.
initCrashReporting();

// Phones stay portrait; tablets / unfolded foldables rotate (orientation-lock.ts).
// Applied here once, then kept in step with the window by useOrientationLock().
applyInitialOrientationLock();

// One line per launch so device logs (logcat / Console.app) show which
// bundle is live — embedded or which OTA update — without signing in.
// (info, not warn: warn would raise a LogBox toast in dev builds.)
// eslint-disable-next-line no-console
console.info(`[chefer] ${CURRENT_BUILD}`);

// UX-X-07: native UI (keyboard, alerts, share sheet) matches the light app.
forceLightAppearance();

// NetInfo → onlineManager, AppState → focusManager (gym offline layer, §5.2).
installQueryConnectivity();

// Usage analytics (T-12.2, §5.10): starts the JS transport's 30s flush timer
// and background-flush listener. A no-op when no PostHog key is configured.
initAnalytics();
track('app_opened', {});

// Store rating prompt (ASO §5.1): counts today as an active day and opens the
// session the prompt's "not the first session / nothing failed" rule reads.
startReviewSession();

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
  useOrientationLock();
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
            {/* The bar never traps what it covers: a touch elsewhere sends it away. */}
            <SnackbarTouchBoundary>
              <NumbersModeHost signedIn={token !== null}>
                <Stack screenOptions={{ headerShown: false }}>
                  <Stack.Protected guard={token !== null}>
                    {/* Food / Gym mode (gym_plan.md D3): two tab groups at the root;
                the persisted mode picks which one "/" opens. */}
                    <Stack.Screen name="(food)" />
                    <Stack.Screen name="(gym)" />
                    {/* Mobile UX revamp: the one-tab-bar shell (`mobileShellV2`)
                    and the old Gym/Cookbook tabs, pushed from it. */}
                    <Stack.Screen name="(main)" />
                    {/* Trainer mode (docs/prd-2026-10/trainer-mode.md §5.2): the second
                    shell, for active trainers with `trainerMode`; the switch on You
                    replaces it with (main) and back (ShellCrossfade). */}
                    <Stack.Screen name="(trainer)" />
                    <Stack.Screen name="training/routine" />
                    <Stack.Screen name="training/exercises" />
                    <Stack.Screen name="training/stats" />
                    <Stack.Screen name="cookbook" />
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
                    <Stack.Screen name="gym/my-week" />
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
                    {/* Trainer coaching (WP-18). The trainer area sits behind `coaching.availability` + the
                        trainer allowlist (TrainerGate); Your trainer behind `coaching.availability`. */}
                    <Stack.Screen name="trainer/index" />
                    <Stack.Screen name="trainer/invite" />
                    <Stack.Screen name="trainer/[clientId]/index" />
                    <Stack.Screen name="trainer/[clientId]/routine" />
                    {/* Trainer mode M2 (trainer-mode.md §6.6): a workout template; `new` makes one. */}
                    <Stack.Screen name="trainer/templates/[id]" />
                    {/* Trainer mode M3 (trainer-mode.md §6.2–§6.4): one booking (attendance, Start, Edit, Cancel). */}
                    <Stack.Screen name="trainer/bookings/[id]" />
                    {/* Trainer mode M3 (§6.7): the coached workout logger; `none` = no booking. Like
                        gym/workout: slides up, no swipe-back out of a running workout. */}
                    <Stack.Screen
                      name="trainer/coach/[bookingId]"
                      options={{ animation: 'slide_from_bottom', gestureEnabled: false }}
                    />
                    <Stack.Screen name="coaching/index" />
                    {/* Trainer mode M3 (§6.9): the client's read-only booking. */}
                    <Stack.Screen name="coaching/bookings/[id]" />
                    {/* PRD 2026-10 §4.1: Find a trainer and a trainer's card ("Ask to coach me"). */}
                    <Stack.Screen name="coaching/find" />
                    <Stack.Screen name="coaching/trainers/[trainerId]" />
                  </Stack.Protected>
                  <Stack.Protected guard={token === null}>
                    <Stack.Screen name="(auth)" />
                  </Stack.Protected>
                  {/* T-39.1: the in-app legal screen — unguarded, reachable both
                  from Register (signed out) and Settings/More (signed in). */}
                  <Stack.Screen name="legal/[doc]" />
                  {/* WP-18: the invite link's route is reachable signed out too — it sends the visitor to
                      sign in / register and PendingJoinHost brings them back (spec §2.3). */}
                  <Stack.Screen name="coaching/join/[code]" />
                </Stack>
              </NumbersModeHost>
            </SnackbarTouchBoundary>
            <AiConsentHost />
            {/* WP-18: after sign-in, returns to the coaching invite the visitor opened signed out. */}
            <PendingJoinHost signedIn={token !== null} />
            {/* UX-PO-08: keeps the opt-in dinner / plan-Sunday nudges scheduled. */}
            <FoodNudgeHost signedIn={token !== null} />
            {/* Trainer mode §7.3: local reminders 60 min before each booking (client and trainer). */}
            <BookingReminderHost signedIn={token !== null} />
            {/* UX-PO-10: after 30 min in the background, a foreground re-lands (food/gym). */}
            <ForegroundLandingHost signedIn={token !== null} />
            {/* Mobile UX revamp: caches `mobileShellV2` for the next cold start. */}
            <ShellFlagHost signedIn={token !== null} />
            {/* Trainer mode §5.1: caches "available" for the next cold start, falls back to personal. */}
            <TrainerModeHost signedIn={token !== null} />
            {/* ADR 0002: the account's language choice wins; reports the phone's language. */}
            <LocaleSyncHost signedIn={token !== null} />
            {/* M1-6: crash reports carry the account id (not name/email). */}
            <CrashReportingUserHost signedIn={token !== null} />
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
