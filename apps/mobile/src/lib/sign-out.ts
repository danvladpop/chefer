import type { QueryClient } from '@tanstack/react-query';
import { clearPendingOnboarding } from '../features/auth/pending-onboarding';
import { clearRegisterDraft } from '../features/auth/register-draft';
import { clearLocalUserData } from '../features/gym/offline/clear-local-data';
import { cancelAllGymReminders } from '../features/gym/reminders/cancel-reminders';
import { resetOnboardingGate } from '../features/onboarding/onboarding-gate';
import { clearToken, getSessionQueryClient } from './auth-store';

// UX-ACC-02 / UX-ACC-12: THE way an account leaves this phone. More, Settings,
// account deletion and the 401 handler all call it — a second, partial
// sign-out is what let the next account see (and overwrite) the previous
// account's allergies, jobs and gym data.
//
// Order matters: stop in-flight reads first so none lands after the wipe,
// empty the cache, wipe the device state, drop the reminders and drafts, and
// clear the token LAST — clearing it flips the auth gate, and the login
// screen must never be able to mount over data that is still being removed.

export type SignOutReason =
  /** The user chose to sign out. */
  | 'user'
  /** The account was deleted. */
  | 'account-deleted'
  /** The API rejected the session (401): unsynced gym workouts are kept for the next login. */
  | 'session-expired';

export interface SignOutOptions {
  /** Defaults to the app's query client (bound by `makeQueryClient`). */
  queryClient?: QueryClient;
  reason?: SignOutReason;
}

let inflight: Promise<void> | null = null;

/** Runs one stage; a failing stage never keeps the token from being cleared. */
async function stage(run: () => unknown): Promise<void> {
  try {
    await run();
  } catch {
    // Best effort — the token below is what actually ends the session.
  }
}

export function signOut(options: SignOutOptions = {}): Promise<void> {
  // Several requests can fail with 401 at once; one sign-out serves them all.
  if (inflight) return inflight;
  const queryClient = options.queryClient ?? getSessionQueryClient();
  const keepGymData = options.reason === 'session-expired';
  inflight = (async () => {
    if (queryClient) {
      await stage(() => queryClient.cancelQueries());
      await stage(() => queryClient.clear());
    }
    await stage(() => clearLocalUserData({ keepGymData }));
    await stage(() => cancelAllGymReminders());
    await stage(() => {
      clearRegisterDraft();
      clearPendingOnboarding();
      resetOnboardingGate();
    });
    await clearToken();
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}
