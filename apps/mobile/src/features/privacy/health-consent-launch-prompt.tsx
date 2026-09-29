import { useEffect } from 'react';
import { trpc } from '../../lib/trpc';
import { useHealthConsent } from './use-health-consent';

// ─── Ask again for data saved before health consent existed (Q-7) ─────────────
// Owner default, PENDING COUNSEL REVIEW: data stored before the consent existed
// is KEPT, and the user is asked for consent on the next launch (consent-based
// legal ground for every health field). This opens the same HealthDataConsent-
// Sheet once per app launch when the signed-in user has not allowed health
// information but already has some stored. "Don't save it" changes nothing
// stored — it only leaves the Food Today nudge (health-consent-notice.tsx) up.
// Mount once in the root layout, next to <AiConsentHost />.

let promptedThisLaunch = false;

export function HealthConsentLaunchPrompt({ signedIn }: { signedIn: boolean }) {
  const { consented, requestHealthConsent, healthConsentSheet } = useHealthConsent();
  const { data: prefs } = trpc.preferences.get.useQuery(undefined, {
    enabled: signedIn && consented === false,
    staleTime: 60_000,
  });

  const profile = prefs?.chefProfile;
  const diet = prefs?.dietaryPreferences;
  const hasStoredHealthData =
    (diet?.allergies.length ?? 0) +
      (diet?.dietaryRestrictions.length ?? 0) +
      (diet?.dislikedIngredients.length ?? 0) >
      0 ||
    [profile?.goal, profile?.age, profile?.heightCm, profile?.weightKg].some(
      (v) => v !== null && v !== undefined,
    );

  useEffect(() => {
    if (!signedIn || consented !== false || !hasStoredHealthData || promptedThisLaunch) return;
    promptedThisLaunch = true;
    requestHealthConsent(() => undefined);
  }, [signedIn, consented, hasStoredHealthData, requestHealthConsent]);

  return healthConsentSheet;
}
