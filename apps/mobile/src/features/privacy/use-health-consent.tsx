import { useCallback, useRef, useState } from 'react';
import { HEALTH_CONSENT_VERSION, needsHealthConsent } from '@chefer/types';
import { track } from '../../lib/analytics';
import { trpc } from '../../lib/trpc';
import { HealthConsentSheet } from './health-consent-sheet';
import { setHealthConsentDeclined } from './health-declined-store';

// ─── useHealthConsent() — the guard around every health save (UX-26, T-26.2) ──
// Health information (allergies, diets, dislikes, goal, body metrics,
// weigh-ins — for you and your household) is stored only after the user taps
// "Allow and save" on the HealthDataConsentSheet, once, the first time they
// save any of it. Separate from `useAiConsent` — never merged: a save that also
// triggers AI asks THIS first for the save; the AI consent still guards the AI
// call itself.
//
//   const { requestHealthConsent, healthConsentSheet } = useHealthConsent();
//   requestHealthConsent(() => saveMutation.mutate(payload), {
//     hasHealthData: draft.allergies.length > 0,
//     onDeclined: () => showAmberNotice(),
//   });
//   …
//   {healthConsentSheet}   // render once in the same component (inside an
//                          // open Sheet's body if the save lives in a Sheet —
//                          // iOS can't present a Modal over a presenting one)
//
// Consent on record (or nothing health-related to store) → `run` fires
// immediately. Otherwise the sheet opens: "Allow and save" grants consent
// (privacy.grantHealthConsent) and runs the save once the sheet is fully gone;
// "Don't save it" runs `onDeclined` and stores NOTHING health-related. ✕, the
// backdrop and Android BACK are a CANCEL, not a decline (UX-ONB-03): the sheet
// closes, nothing is saved and nothing is cleared, so the user keeps what they
// picked and can save again. Under HEALTH_CONSENT_ENFORCE=declared the server also rejects
// an un-consented health write from this client (api level >= 4).

export interface RequestHealthConsentOptions {
  /** False when nothing health-related is being stored (e.g. a member with only a name): `run` at once. */
  hasHealthData?: boolean;
  /** "Don't save it": keep the non-health fields, skip the health ones, show the amber notice. */
  onDeclined?: () => void;
}

export type RequestHealthConsent = (run: () => void, options?: RequestHealthConsentOptions) => void;

export interface HealthConsentApi {
  /** true = on record, false = not yet / withdrawn, undefined = still loading. */
  consented: boolean | undefined;
  requestHealthConsent: RequestHealthConsent;
  /** Render once in the component that calls `requestHealthConsent`. */
  healthConsentSheet: React.ReactElement;
}

export function useHealthConsent(): HealthConsentApi {
  const utils = trpc.useUtils();
  const { data: me } = trpc.user.me.useQuery(undefined, { staleTime: 30_000 });
  const [open, setOpen] = useState(false);
  const pending = useRef<{ run: () => void; onDeclined?: () => void } | null>(null);
  const runOnExit = useRef<(() => void) | null>(null);
  const declineOnExit = useRef<(() => void) | null>(null);

  const grant = trpc.privacy.grantHealthConsent.useMutation({
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
      // Read the cache at CALL time, not from a render closure: a `run` that
      // was captured before the user allowed (and re-enters this guard, e.g.
      // the last onboarding step) must see the fresh answer.
      const cached = utils.user.me.getData();
      if (cached === undefined) {
        // Not loaded yet: look it up rather than asking someone who already
        // consented. A failed lookup asks (the safe side — nothing is stored).
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
          track('health_consent_answered', { allowed: true });
          setHealthConsentDeclined(false);
          runOnExit.current = pending.current?.run ?? null;
          pending.current = null;
          setOpen(false);
        },
      },
    );
  }, [mutateGrant]);

  const decline = useCallback(() => {
    track('health_consent_answered', { allowed: false });
    setHealthConsentDeclined(true);
    declineOnExit.current = pending.current?.onDeclined ?? null;
    pending.current = null;
    runOnExit.current = null;
    setOpen(false);
  }, []);

  // ✕ / backdrop / Android BACK: close without answering. Neither `run` nor
  // `onDeclined` fires, and the consent question stays open for the next save.
  const cancel = useCallback(() => {
    pending.current = null;
    runOnExit.current = null;
    declineOnExit.current = null;
    setOpen(false);
  }, []);

  // Callbacks run once the sheet is fully gone, so they may present another
  // Modal (the AI consent sheet) or navigate.
  const onExited = useCallback(() => {
    const run = runOnExit.current;
    const declined = declineOnExit.current;
    runOnExit.current = null;
    declineOnExit.current = null;
    if (run) run();
    else declined?.();
  }, []);

  const healthConsentSheet = (
    <HealthConsentSheet
      visible={open}
      saving={grant.isPending}
      saveFailed={grant.isError}
      onAllow={allow}
      onDecline={decline}
      onCancel={cancel}
      onExited={onExited}
    />
  );

  const consented = me === undefined ? undefined : !needsHealthConsent(me);
  return { consented, requestHealthConsent: request, healthConsentSheet };
}
