'use client';

import { useState } from 'react';
import { useHealthConsent } from '@/features/privacy/use-health-consent';
import { capture } from '@/lib/analytics';
import { trpc } from '@/lib/trpc';
import {
  HEALTH_CONSENT_COPY,
  HEALTH_WITHDRAW_CONFIRM,
  healthConsentAllowedLine,
} from '@chefer/types';
import { Button, Sheet } from '@chefer/ui';

// ─── Profile › Privacy & data › Health information (UX-26, T-26.4) ────────────
// Mirrors apps/mobile/src/features/privacy/health-consent-card.tsx: consent
// status (`Allowed on {date}`) and `Withdraw and delete` behind a confirm — it
// removes allergies, diets, dislikes, goal, measurements and weigh-ins for you
// and your household; plans stop being checked. Separate from AiConsentCard.
// PENDING COUNSEL REVIEW: copy.

export function HealthConsentCard() {
  const utils = trpc.useUtils();
  const { data: me } = trpc.user.me.useQuery(undefined, { staleTime: 30_000 });
  const { requestHealthConsent, healthConsentSheet } = useHealthConsent();
  const [confirming, setConfirming] = useState(false);

  const withdraw = trpc.privacy.withdrawHealthData.useMutation({
    onSuccess: () => {
      capture('health_consent_withdrawn', {});
      setConfirming(false);
      // Everything that read the deleted data: rules, targets, plans' "Checked for", weigh-ins.
      void utils.invalidate();
    },
  });
  const consentedAt = me?.healthDataConsentAt ?? null;

  return (
    <div
      className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5"
      data-testid="health-consent-card"
    >
      <h2 className="mb-1 font-semibold text-gray-800">{HEALTH_CONSENT_COPY.rowTitle}</h2>
      <p className="text-sm text-gray-600" data-testid="health-consent-status">
        {consentedAt
          ? healthConsentAllowedLine(consentedAt)
          : me
            ? HEALTH_CONSENT_COPY.rowNotAllowed
            : ' '}
      </p>
      <div className="mt-3">
        {consentedAt ? (
          <Button
            variant="outline"
            onClick={() => setConfirming(true)}
            data-testid="health-withdraw"
          >
            {HEALTH_CONSENT_COPY.withdraw}
          </Button>
        ) : (
          me && (
            <Button
              variant="outline"
              onClick={() => requestHealthConsent(() => void utils.user.me.invalidate())}
              data-testid="health-allow"
            >
              {HEALTH_CONSENT_COPY.rowAllowAction}
            </Button>
          )
        )}
      </div>
      {withdraw.isError && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {HEALTH_CONSENT_COPY.withdrawError}
        </p>
      )}
      {withdraw.isSuccess && !consentedAt && (
        <p role="status" className="mt-2 text-sm text-gray-700">
          {HEALTH_CONSENT_COPY.withdrawDone}
        </p>
      )}
      <Sheet
        open={confirming}
        onClose={() => setConfirming(false)}
        title={HEALTH_CONSENT_COPY.withdrawTitle}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setConfirming(false)}>
              {HEALTH_CONSENT_COPY.withdrawKeep}
            </Button>
            <Button
              variant="destructive"
              disabled={withdraw.isPending}
              onClick={() => withdraw.mutate({ confirm: HEALTH_WITHDRAW_CONFIRM })}
              data-testid="health-withdraw-confirm"
            >
              {HEALTH_CONSENT_COPY.withdraw}
            </Button>
          </div>
        }
      >
        <p className="px-5 pb-2 text-sm text-gray-700">{HEALTH_CONSENT_COPY.withdrawBody}</p>
      </Sheet>
      {healthConsentSheet}
    </div>
  );
}
