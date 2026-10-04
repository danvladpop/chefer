'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { COACHING_COPY, type InvitePreviewDto } from '@chefer/types';
import { Button } from '@chefer/ui';
import { userFacingErrorMessage } from '@chefer/utils';
import { clearPendingJoin, rememberPendingJoin } from '../lib/pending-join';
import { ConsentScreen } from './ConsentScreen';

// ─── /coaching/join/<code> (spec §2.3) ────────────────────────────────────────
// previewInvite -> consent screen -> join. Every invite state has copy. A client
// without gym setup is sent to the existing setup first; the code is kept on the
// device and Gym Today offers to carry on. On a phone the page first offers the
// app (`chefer://`, no universal links: they need native config).

const MOBILE_UA = /Android|iPhone|iPad|iPod/i;

function Page({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-lg px-4 py-6 sm:px-6 sm:py-10">{children}</div>;
}

function Message({ title, body }: { title: string; body: string }) {
  return (
    <Page>
      <h1 className="font-serif text-2xl font-bold text-gray-900">{title}</h1>
      <p className="mt-3 text-sm text-gray-700" data-testid="coaching-invite-message">
        {body}
      </p>
      <Link
        href="/gym"
        className="mt-6 inline-flex min-h-11 items-center text-sm font-medium text-gray-900 underline underline-offset-4"
      >
        Go to Gym
      </Link>
    </Page>
  );
}

function stateMessage(preview: InvitePreviewDto): string | null {
  const copy = COACHING_COPY.inviteState;
  switch (preview.state) {
    case 'OK':
      return null;
    case 'ALREADY_YOURS':
      return copy.ALREADY_YOURS(preview.trainerName ?? COACHING_COPY.yourTrainer.title);
    case 'EXPIRED':
    case 'USED':
    case 'REVOKED':
    case 'SELF':
    case 'NOT_FOUND':
      return copy[preview.state];
  }
}

export function JoinFlow({ code }: { code: string }) {
  const router = useRouter();
  const utils = trpc.useUtils();
  // Always fresh: the answer changes while the page is away (gym setup done, link
  // used), and a cached "needs gym setup" would strand a client who just finished it.
  const preview = trpc.coaching.previewInvite.useQuery(
    { code },
    { retry: false, staleTime: 0, gcTime: 0, refetchOnMount: 'always' },
  );
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState<string | null>(null);
  const [choice, setChoice] = useState<'ask' | 'web'>('web');

  useEffect(() => {
    if (MOBILE_UA.test(navigator.userAgent)) setChoice('ask');
  }, []);

  const join = trpc.coaching.join.useMutation({
    meta: { silent: true },
    onSuccess: (status) => {
      clearPendingJoin();
      void utils.coaching.status.invalidate();
      void utils.gym.bootstrap.invalidate();
      void utils.gym.routine.get.invalidate();
      setJoined(
        status.trainer?.name ?? preview.data?.trainerName ?? COACHING_COPY.yourTrainer.title,
      );
    },
    onError: (err) => setError(userFacingErrorMessage(err)),
  });

  if (joined) {
    return (
      <Page>
        <h1 className="font-serif text-2xl font-bold text-gray-900" data-testid="coaching-joined">
          {COACHING_COPY.consent.joinedTitle(joined)}
        </h1>
        <p className="mt-3 text-sm text-gray-700">{COACHING_COPY.consent.oneTrainer(joined)}</p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Button asChild className="min-h-11">
            <Link href="/gym/routine">Open my routine</Link>
          </Button>
          <Button asChild variant="outline" className="min-h-11">
            <Link href="/profile#your-trainer">{COACHING_COPY.yourTrainer.title}</Link>
          </Button>
        </div>
      </Page>
    );
  }

  if (preview.isLoading) {
    return (
      <Page>
        <h1 className="sr-only">Coaching invite</h1>
        <div className="h-64 animate-pulse rounded-2xl bg-gray-100" aria-hidden="true" />
      </Page>
    );
  }

  // A failed preview (flag off, malformed code, offline) reads like an unknown code:
  // the API answers an off flag with the same NOT_FOUND as a code that never existed.
  if (preview.isError || !preview.data) {
    return <Message title="Coaching invite" body={COACHING_COPY.inviteState.NOT_FOUND} />;
  }

  const data = preview.data;
  const message = stateMessage(data);
  if (message !== null) return <Message title="Coaching invite" body={message} />;

  const trainerName = data.trainerName ?? COACHING_COPY.yourTrainer.title;

  if (data.needsGymSetup) {
    return (
      <Page>
        <h1 className="font-serif text-2xl font-bold text-gray-900">
          {COACHING_COPY.consent.title(trainerName)}
        </h1>
        <p className="mt-3 text-sm text-gray-700">{COACHING_COPY.consent.needsSetup}</p>
        <Button asChild className="mt-6 min-h-11">
          <Link href="/gym/setup" onClick={() => rememberPendingJoin(code)}>
            Set up training
          </Link>
        </Button>
      </Page>
    );
  }

  return (
    <Page>
      {choice === 'ask' && (
        <div
          className="mb-5 flex flex-col gap-2 rounded-2xl border bg-white p-4 shadow-sm"
          data-testid="coaching-open-in-app"
        >
          <p className="text-sm font-medium text-gray-900">
            {COACHING_COPY.consent.title(trainerName)}
          </p>
          <Button asChild className="min-h-11">
            <a href={`chefer://coaching/join/${encodeURIComponent(code)}`}>
              {COACHING_COPY.consent.openInApp}
            </a>
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => setChoice('web')}
          >
            {COACHING_COPY.consent.continueOnWeb}
          </Button>
        </div>
      )}
      {choice === 'web' && (
        <ConsentScreen
          trainerName={trainerName}
          currentTrainerName={data.currentTrainerName}
          busy={join.isPending}
          error={error}
          onAllow={() => {
            setError(null);
            join.mutate({ code, source: 'web' });
          }}
          onDecline={() => router.push('/gym')}
        />
      )}
      {choice === 'ask' && <h1 className="sr-only">{COACHING_COPY.consent.title(trainerName)}</h1>}
    </Page>
  );
}
