import Link from 'next/link';
import { StoreBadges, StoreTrademarks } from '@/features/app-stores/components/StoreBadges';
import { COACHING_COPY } from '@chefer/types';
import { Button } from '@chefer/ui';
import { nextQuery } from '../lib/next-path';
import { appJoinUrl } from '../lib/open-in-app';

// ─── /coaching/join/<code>, signed out on a phone ─────────────────────────────
// The middleware rewrites here (the address bar keeps the invite link) so the
// app is one tap away before any sign-in. Nothing about the invite is shown:
// coaching.previewInvite needs an account, so the trainer's name stays in the
// app / behind sign-in. "Continue on the web" is today's login + `next` flow.

const COPY = {
  title: 'Join your trainer on Chefer',
  body: 'Your trainer sent you this invite. Open it in the Chefer app to see who it’s from and join.',
  noApp: 'No app yet? Get it free, then open your invite link again.',
};

export function SignedOutInvite({ code }: { code: string }) {
  const joinPath = `/coaching/join/${code}`;
  return (
    <div
      className="mx-auto flex w-full max-w-md flex-col px-4 py-8"
      data-testid="coaching-invite-signed-out"
    >
      <p className="flex items-center gap-2 font-serif text-2xl font-semibold text-[#944a00]">
        <span className="text-3xl" aria-hidden="true">
          🍽️
        </span>
        <span>Chefer</span>
      </p>
      <h1 className="mt-6 font-serif text-2xl font-bold text-gray-900">{COPY.title}</h1>
      <p className="mt-3 text-sm text-gray-700">{COPY.body}</p>
      <Button asChild className="mt-6 min-h-11">
        <a href={appJoinUrl(code)}>{COACHING_COPY.consent.openInApp}</a>
      </Button>
      <p className="mt-6 text-sm text-gray-700">{COPY.noApp}</p>
      <StoreBadges campaign="coaching-invite" className="mt-3 gap-x-2" />
      <Button asChild variant="outline" className="mt-6 min-h-11">
        <Link href={`/login${nextQuery(joinPath)}`}>{COACHING_COPY.consent.continueOnWeb}</Link>
      </Button>
      <StoreTrademarks className="mt-8 text-center" />
    </div>
  );
}
