'use client';

import { createContext, useCallback, useContext, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { AI_CONSENT_COPY, AI_CONSENT_FEATURE_DATA, type AiConsentFeature } from '@chefer/types';
import { Button, Sheet } from '@chefer/ui';
import { aiConsentIntro, needsAiDataConsent } from '@chefer/utils';

// ─── AI data consent gate (App Store 5.1.2(i)) ───────────────────────────────
// Every client action that sends personal data to the AI provider goes
// through requestAiConsent(feature, run). Consent on record → `run` fires
// immediately (same tick, so user-gesture APIs still work). Otherwise the
// consent sheet opens: "Allow" records consent (user.grantAiDataConsent) and
// then runs the original action; "Not now" drops it — nothing is sent.
// Mirrors apps/mobile/src/features/ai-consent/ai-consent-provider.tsx; the
// copy and the when-to-ask logic are shared (@chefer/types, @chefer/utils).

export interface RequestAiConsentOptions {
  /** False when this call will not reach the AI (e.g. a free curated swap). */
  usesAi?: boolean;
}

type RequestAiConsent = (
  feature: AiConsentFeature,
  run: () => void,
  options?: RequestAiConsentOptions,
) => void;

const AiConsentContext = createContext<RequestAiConsent | null>(null);
const AiConsentOpenContext = createContext(false);

/** The consent guard. Must be rendered under <AiConsentProvider>. */
export function useAiConsent(): RequestAiConsent {
  const request = useContext(AiConsentContext);
  if (!request) throw new Error('useAiConsent must be used inside <AiConsentProvider>');
  return request;
}

/**
 * True while the consent sheet is showing — surfaces with their own key
 * handling (the chat panel's focus trap / Escape) stand down meanwhile.
 */
export function useAiConsentOpen(): boolean {
  return useContext(AiConsentOpenContext);
}

export function AiConsentProvider({ children }: { children: React.ReactNode }) {
  const utils = trpc.useUtils();
  const { data: me } = trpc.user.me.useQuery(undefined, { staleTime: 30_000 });
  const [pending, setPending] = useState<{ feature: AiConsentFeature; run: () => void } | null>(
    null,
  );
  // Kept after close so the copy doesn't change during the exit animation.
  const [feature, setFeature] = useState<AiConsentFeature>('meal-plan');
  const grant = trpc.user.grantAiDataConsent.useMutation({
    onSuccess: ({ aiDataConsentAt }) => {
      utils.user.me.setData(undefined, (prev) => (prev ? { ...prev, aiDataConsentAt } : prev));
    },
  });

  const resetGrant = grant.reset;
  const request = useCallback<RequestAiConsent>(
    (requested, run, options) => {
      const usesAi = options?.usesAi ?? true;
      const ask = () => {
        resetGrant();
        setFeature(requested);
        setPending({ feature: requested, run });
      };
      if (me === undefined && usesAi) {
        // user.me not loaded yet: look it up rather than asking someone who
        // already consented. A failed lookup asks (the safe side).
        utils.user.me
          .fetch()
          .then((user) => (needsAiDataConsent(user) ? ask() : run()))
          .catch(ask);
        return;
      }
      if (needsAiDataConsent(me, usesAi)) ask();
      else run();
    },
    [me, utils, resetGrant],
  );

  const close = () => setPending(null);
  const allow = () => {
    if (!pending) return;
    const { run } = pending;
    grant.mutate(undefined, {
      onSuccess: () => {
        setPending(null);
        run();
      },
    });
  };

  return (
    <AiConsentContext.Provider value={request}>
      <AiConsentOpenContext.Provider value={pending !== null}>
        {children}
      </AiConsentOpenContext.Provider>
      <Sheet
        open={pending !== null}
        onClose={close}
        title={AI_CONSENT_COPY.title}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={close} data-testid="ai-consent-not-now">
              {AI_CONSENT_COPY.notNow}
            </Button>
            <Button onClick={allow} disabled={grant.isPending} data-testid="ai-consent-allow">
              {grant.isPending ? AI_CONSENT_COPY.saving : AI_CONSENT_COPY.allow}
            </Button>
          </div>
        }
      >
        <div className="space-y-3 px-5 pb-2 text-sm text-gray-700" data-testid="ai-consent-sheet">
          <p>{aiConsentIntro(feature)}</p>
          <div>
            <h3 className="font-semibold text-gray-900">{AI_CONSENT_COPY.sentHeading}</h3>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {AI_CONSENT_FEATURE_DATA[feature].data.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
          <p className="font-medium text-gray-900">{AI_CONSENT_COPY.noTraining}</p>
          <p>{AI_CONSENT_COPY.backupProvider}</p>
          <p>{AI_CONSENT_COPY.control}</p>
          <p>
            <a
              href={AI_CONSENT_COPY.privacyPath}
              target="_blank"
              rel="noreferrer"
              className="touch-target relative text-[#944a00] underline underline-offset-4"
            >
              {AI_CONSENT_COPY.privacyLabel}
            </a>
          </p>
          {grant.isError && (
            <p role="alert" className="text-red-700">
              {AI_CONSENT_COPY.saveError}
            </p>
          )}
        </div>
      </Sheet>
    </AiConsentContext.Provider>
  );
}
