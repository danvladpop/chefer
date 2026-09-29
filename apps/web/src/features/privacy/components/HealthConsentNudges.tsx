'use client';

import { useEffect, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { HEALTH_CONSENT_COPY } from '@chefer/types';
import { Button } from '@chefer/ui';
import { getHealthConsentDeclined } from '../health-declined-flag';
import { useHealthConsent } from '../use-health-consent';

// ─── Two nudges back into the consent sheet (UX-26, Q-7) ──────────────────────
// Mobile twins: health-consent-notice.tsx and health-consent-launch-prompt.tsx.
// Mount both on the dashboard (owned by the dashboard lane).
//
// `HealthConsentTodayNotice` — "Plans aren't being checked for allergies" /
// "Allow health information": only when the user has NOT allowed health
// information AND answered "Don't save it" in this browser; dismissible.
//
// `HealthConsentLaunchPrompt` — data saved before the consent existed is KEPT
// (owner default for Q-7, PENDING COUNSEL REVIEW) and the user is asked once
// per session when they have some stored but have not allowed it.

export function HealthConsentTodayNotice() {
  const { consented, requestHealthConsent, healthConsentSheet } = useHealthConsent();
  const [declined, setDeclined] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => setDeclined(getHealthConsentDeclined()), [consented]);

  if (consented !== false || !declined || dismissed) return healthConsentSheet;
  return (
    <>
      <div
        data-testid="health-consent-notice-card"
        className="rounded-xl border border-amber-300 bg-amber-50 p-4"
      >
        <p className="text-sm font-semibold text-amber-900">{HEALTH_CONSENT_COPY.todayCardTitle}</p>
        <div className="mt-2 flex gap-2">
          <Button size="sm" onClick={() => requestHealthConsent(() => undefined)}>
            {HEALTH_CONSENT_COPY.todayCardAction}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>
            Dismiss
          </Button>
        </div>
      </div>
      {healthConsentSheet}
    </>
  );
}

let promptedThisSession = false;

/** Test seam: forget that this session already prompted. */
export function resetHealthConsentLaunchPromptForTests(): void {
  promptedThisSession = false;
}

export function HealthConsentLaunchPrompt() {
  const { consented, requestHealthConsent, healthConsentSheet } = useHealthConsent();
  const { data: prefs } = trpc.preferences.get.useQuery(undefined, {
    enabled: consented === false,
    staleTime: 60_000,
  });
  const diet = prefs?.dietaryPreferences;
  const profile = prefs?.chefProfile;
  const hasStoredHealthData =
    (diet?.allergies.length ?? 0) +
      (diet?.dietaryRestrictions.length ?? 0) +
      (diet?.dislikedIngredients.length ?? 0) >
      0 ||
    [profile?.goal, profile?.age, profile?.heightCm, profile?.weightKg].some(
      (v) => v !== null && v !== undefined,
    );

  useEffect(() => {
    if (consented !== false || !hasStoredHealthData || promptedThisSession) return;
    promptedThisSession = true;
    requestHealthConsent(() => undefined);
  }, [consented, hasStoredHealthData, requestHealthConsent]);

  return healthConsentSheet;
}
