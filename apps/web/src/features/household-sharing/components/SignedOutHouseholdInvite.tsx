import Link from 'next/link';
import { StoreBadges, StoreTrademarks } from '@/features/app-stores/components/StoreBadges';
import { nextQuery } from '@/features/coaching/lib/next-path';
import { HOUSEHOLD_SHARING_COPY as COPY } from '@chefer/types';
import { Button } from '@chefer/ui';
import { appHouseholdJoinUrl } from '../lib/open-in-app';

// ─── /household/join/<code>, signed out on a phone (ADR 0002) ─────────────────
// The coaching-invite pattern: the middleware rewrites here (the address bar
// keeps the invite link) so the app is one tap away before any sign-in.
// Nothing about the invite is shown — household.previewInvite needs an
// account. "Continue on the web" is the login + `next` flow.

export function SignedOutHouseholdInvite({ code }: { code: string }) {
  const joinPath = `/household/join/${code}`;
  return (
    <div
      className="mx-auto flex w-full max-w-md flex-col px-4 py-8"
      data-testid="household-invite-signed-out"
    >
      <p className="flex items-center gap-2 font-serif text-2xl font-semibold text-[#944a00]">
        <span className="text-3xl" aria-hidden="true">
          🍽️
        </span>
        <span>Chefer</span>
      </p>
      <h1 className="mt-6 font-serif text-2xl font-bold text-gray-900">{COPY.signedOutTitle}</h1>
      <p className="mt-3 text-sm text-gray-700">{COPY.signedOutBody}</p>
      <Button asChild className="mt-6 min-h-11">
        <a href={appHouseholdJoinUrl(code)}>{COPY.openInApp}</a>
      </Button>
      <p className="mt-6 text-sm text-gray-700">{COPY.signedOutNoApp}</p>
      {/* The store campaign list has no household entry yet (packages/types/app-stores). */}
      <StoreBadges campaign="household-invite" className="mt-3 gap-x-2" />
      <Button asChild variant="outline" className="mt-6 min-h-11">
        <Link href={`/login${nextQuery(joinPath)}`}>{COPY.continueOnWeb}</Link>
      </Button>
      <StoreTrademarks className="mt-8 text-center" />
    </div>
  );
}
