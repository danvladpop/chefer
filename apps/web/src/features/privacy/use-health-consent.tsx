'use client';

import { useCallback, useRef, useState } from 'react';
import { capture } from '@/lib/analytics';
import { trpc } from '@/lib/trpc';
import { HEALTH_CONSENT_VERSION, needsHealthConsent } from '@chefer/types';
import { HealthConsentSheet } from './components/HealthConsentSheet';
import { setHealthConsentDeclined } from './health-declined-flag';

// ─── useHealthConsent() — the guard around every health save (UX-26, T-26.2) ──
// Web twin of apps/mobile/src/features/privacy/use-health-consent.tsx; read that
// header for the full contract. In short: consent on record (or nothing
// health-related to store) → `run` fires at once (same tick, so user-gesture
// APIs still work); otherwise the sheet opens and "Allow and save" grants
// consent (privacy.grantHealthConsent) then runs the save, while "Don't save
// it" (or Escape / close) runs `onDeclined` and stores NOTHING health-related.
// Separate from `useAiConsent` — never merged.
//
//   const { requestHealthConsent, healthConsentSheet } = useHealthConsent();
//   requestHealthConsent(() => save.mutate(x), { hasHealthData, onDeclined });
//   …{healthConsentSheet}

export interface RequestHealthConsentOptions {
  /** False when nothing health-related is being stored: `run` at once. */
  hasHealthData?: boolean;
  /** "Don't save it": keep the non-health fields, skip the health ones, show the notice. */
  onDeclined?: () => void;
}

export type RequestHealthConsent = (run: () => void, options?: RequestHealthConsentOptions) => void;

export interface HealthConsentApi {
  /** true = on record, false = not yet / withdrawn, undefined = still loading. */
  consented: boolean | undefined;
  requestHealthConsent: RequestHealthConsent;
  healthConsentSheet: React.ReactElement;
}

export function useHealthConsent(): HealthConsentApi {
  const utils = trpc.useUtils();
  const { data: me } = trpc.user.me.useQuery(undefined, { staleTime: 30_000 });
  const [open, setOpen] = useState(false);
  const pending = useRef<{ run: () => void; onDeclined?: () => void } | null>(null);

  const grant = trpc.privacy.grantHealthConsent.useMutation({
    meta: { silent: true },
    onSuccess: ({ healthDataConsentAt }) => {
      utils.user.me.setData(undefined, (prev) => (prev ? { ...prev, healthDataConsentAt } : prev));
    },
  });
  const resetGrant = grant.reset;
  const mutateGrant = grant.mutate;

  const request = useCallback<RequestHealthConsent>(
    (run, options) => {
      if (options?.hasHealthData === false) {
        run();
        return;
      }
      const ask = () => {
        resetGrant();
        pending.current = { run, ...(options?.onDeclined && { onDeclined: options.onDeclined }) };
        setOpen(true);
      };
      // Read the cache at CALL time so a `run` captured before the user allowed
      // (and re-entering this guard) sees the fresh answer.
      const cached = utils.user.me.getData();
      if (cached === undefined) {
        utils.user.me
          .fetch()
          .then((user) => (needsHealthConsent(user) ? ask() : run()))
          .catch(ask);
        return;
      }
      if (needsHealthConsent(cached)) ask();
      else run();
    },
    [utils, resetGrant],
  );

  const allow = useCallback(() => {
    mutateGrant(
      { version: HEALTH_CONSENT_VERSION },
      {
        onSuccess: () => {
          capture('health_consent_answered', { allowed: true });
          setHealthConsentDeclined(false);
          const run = pending.current?.run;
          pending.current = null;
          setOpen(false);
          run?.();
        },
      },
    );
  }, [mutateGrant]);

  const decline = useCallback(() => {
    capture('health_consent_answered', { allowed: false });
    setHealthConsentDeclined(true);
    const onDeclined = pending.current?.onDeclined;
    pending.current = null;
    setOpen(false);
    onDeclined?.();
  }, []);

  const healthConsentSheet = (
    <HealthConsentSheet
      open={open}
      saving={grant.isPending}
      saveFailed={grant.isError}
      onAllow={allow}
      onDecline={decline}
    />
  );

  const consented = me === undefined ? undefined : !needsHealthConsent(me);
  return { consented, requestHealthConsent: request, healthConsentSheet };
}
