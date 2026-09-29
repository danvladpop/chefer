import { useState } from 'react';
import { useHealthConsentDeclined } from './health-declined-store';
import { HealthConsentNoticeCard } from './health-notices';
import { useHealthConsent } from './use-health-consent';

// ─── Food Today nudge after "Don't save it" (UX-26, T-26.2, AC2) ──────────────
// "Plans aren't being checked for allergies" / "Allow health information".
// Shown only when the user has NOT allowed health information AND has turned
// the sheet down on this device (a brand-new user never sees it); dismissible
// for the session; the button reopens the consent sheet. Mount it on Food
// Today (`app/(food)/index.tsx`, owned by the dashboard lane).

export function HealthConsentTodayNotice() {
  const declined = useHealthConsentDeclined();
  const { consented, requestHealthConsent, healthConsentSheet } = useHealthConsent();
  const [dismissed, setDismissed] = useState(false);

  if (consented !== false || !declined || dismissed) return healthConsentSheet;
  return (
    <>
      <HealthConsentNoticeCard
        onAllow={() => requestHealthConsent(() => undefined)}
        onDismiss={() => setDismissed(true)}
      />
      {healthConsentSheet}
    </>
  );
}
