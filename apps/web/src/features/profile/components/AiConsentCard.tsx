'use client';

import Link from 'next/link';
import { useAiProviderDisclosure } from '@/features/ai-consent/use-ai-providers';
import { trpc } from '@/lib/trpc';
import { AI_CONSENT_COPY } from '@chefer/types';
import { Switch } from '@chefer/ui';
import { aiConsentToggleOn } from '@chefer/utils';

// ─── AI & your data (App Store 5.1.2(i)) ─────────────────────────────────────
// The standing control for the consent the AI guard asks for before the first
// AI action. Off = the next AI action asks again. Mirrors
// apps/mobile/src/features/profile/ai-consent-card.tsx.

export function AiConsentCard() {
  const utils = trpc.useUtils();
  const { data: user } = trpc.user.me.useQuery(undefined, { staleTime: 30_000 });
  const providers = useAiProviderDisclosure();
  const onSaved = ({ aiDataConsentAt }: { aiDataConsentAt: Date | null }) =>
    utils.user.me.setData(undefined, (prev) => (prev ? { ...prev, aiDataConsentAt } : prev));
  const grant = trpc.user.grantAiDataConsent.useMutation({ onSuccess: onSaved });
  const revoke = trpc.user.revokeAiDataConsent.useMutation({ onSuccess: onSaved });
  const busy = grant.isPending || revoke.isPending;
  const enabled = Boolean(user?.aiDataConsentAt);

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5" data-testid="ai-consent-card">
      <h2 className="mb-3 font-semibold text-gray-800">{AI_CONSENT_COPY.cardTitle}</h2>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p id="ai-consent-label" className="text-sm font-medium text-gray-900">
            {AI_CONSENT_COPY.toggleTitle}
          </p>
          <p className="mt-0.5 text-xs text-gray-600">
            {enabled ? aiConsentToggleOn(providers) : AI_CONSENT_COPY.toggleOff}{' '}
            <Link
              href={AI_CONSENT_COPY.privacyPath}
              className="touch-target relative text-[#944a00] underline underline-offset-4"
            >
              {AI_CONSENT_COPY.privacyLabel}
            </Link>
          </p>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={(next) => (next ? grant.mutate() : revoke.mutate())}
          aria-labelledby="ai-consent-label"
          disabled={!user || busy}
        />
      </div>
      {(grant.isError || revoke.isError) && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {AI_CONSENT_COPY.saveError}
        </p>
      )}
    </div>
  );
}
