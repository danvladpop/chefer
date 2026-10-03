import { getToken } from '../../lib/auth-store';
import { trpc } from '../../lib/trpc';
import { readOnboardingDraft } from './onboarding-draft';
import { isOnboardingGateHandled } from './onboarding-gate';

// UX-ONB-01: should the Food layout send this sign-in into the onboarding
// wizard? Two signals, either one is enough:
//  • a saved draft for THIS session (the app was killed or BACK-ed out
//    mid-wizard) — read synchronously, so a resumed setup is the first frame;
//  • the server says the account never answered "what should Chefer help
//    with?" (`preferences.get().jobs` is empty) — covers a Free user who lost
//    the local state, and an account whose registration was interrupted before
//    the wizard first saved anything. Every explicit exit that is not "Leave
//    for now" writes a job ("Just looking around" saves PLAN_MEALS), so an
//    account that chose to skip is never nagged. A failed or loading query
//    never redirects.
// Asked once per sign-in per launch (see onboarding-gate.ts).
export function useOnboardingGate(): boolean {
  const token = getToken();
  const prefs = trpc.preferences.get.useQuery(undefined, { enabled: token !== null });
  if (token === null || isOnboardingGateHandled(token)) return false;
  if (readOnboardingDraft(token) !== null) return true;
  return prefs.data?.jobs.length === 0;
}
