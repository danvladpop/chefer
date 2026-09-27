'use client';

import { useMemo, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { LEGAL_VERSIONS } from '@chefer/types';

// T-39.1: the "re-accept sheet" for an existing, signed-in account whose
// stored Terms/Privacy acceptance predates a document version bump. Reads
// the consent log (already-shipped `privacy.getConsentHistory`, T-39.2)
// rather than a field on `ctx.user`/`UserProfile` — that type is owned by
// another lane this wave, so this stays a read of the existing endpoint.
//
// NOT YET MOUNTED — see the handoff note in the wave-1 report: it needs one
// line in `apps/web/src/app/(dashboard)/layout.tsx` (a file outside this
// lane's ownership), e.g. `<TermsReacceptGate />` rendered once for the
// whole authenticated shell.

function isStale(latestVersion: string | null): boolean {
  if (!latestVersion) return true;
  // Version strings are `YYYY-MM-DD` — string comparison already orders
  // them correctly.
  return latestVersion < LEGAL_VERSIONS.terms;
}

export function TermsReacceptGate() {
  const [dismissedThisSession, setDismissedThisSession] = useState(false);
  const { data: history } = trpc.privacy.getConsentHistory.useQuery(undefined, {
    staleTime: 5 * 60_000,
  });
  const acceptTerms = trpc.privacy.acceptTerms.useMutation();

  const latestTermsVersion = useMemo(() => {
    const terms = (history ?? []).filter((e) => e.kind === 'TERMS');
    return terms.length > 0 ? (terms[0]?.documentVersion ?? null) : null;
  }, [history]);

  const stale = history !== undefined && isStale(latestTermsVersion) && !dismissedThisSession;
  if (!stale) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="terms-reaccept-title"
      className="fixed inset-x-0 bottom-0 z-50 flex flex-col gap-3 border-t bg-white p-4 shadow-2xl sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-96 sm:rounded-2xl sm:border"
    >
      <h2 id="terms-reaccept-title" className="text-sm font-semibold text-neutral-900">
        Our Terms and Privacy Policy were updated
      </h2>
      <p className="text-sm text-neutral-600">
        Please review and accept the current{' '}
        <a href="/terms" target="_blank" rel="noreferrer" className="text-primary underline">
          Terms
        </a>{' '}
        and{' '}
        <a href="/privacy" target="_blank" rel="noreferrer" className="text-primary underline">
          Privacy Policy
        </a>{' '}
        to keep using Chefer.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setDismissedThisSession(true)}
          className="min-h-11 flex-1 rounded-md border border-input px-3 text-sm font-medium"
        >
          Not now
        </button>
        <button
          type="button"
          disabled={acceptTerms.isPending}
          onClick={() =>
            acceptTerms.mutate(
              { documentVersion: LEGAL_VERSIONS.terms },
              { onSuccess: () => setDismissedThisSession(true) },
            )
          }
          className="min-h-11 flex-1 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          I agree
        </button>
      </div>
    </div>
  );
}
