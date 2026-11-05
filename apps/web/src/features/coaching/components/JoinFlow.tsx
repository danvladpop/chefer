'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { trackSharingChosen } from '@/lib/analytics-events';
import { useT } from '@/lib/i18n';
import { trpc } from '@/lib/trpc';
import type { Translator } from '@chefer/i18n';
import { NO_COACHING_SHARE, type CoachingShareChoice, type InvitePreviewDto } from '@chefer/types';
import { Button } from '@chefer/ui';
import { localDateStr, userFacingErrorMessage } from '@chefer/utils';
import { trainerNameOrFallbackT } from '../lib/copy';
import { appJoinUrl, isMobileUserAgent } from '../lib/open-in-app';
import { clearPendingJoin, rememberPendingJoin } from '../lib/pending-join';
import { ConsentScreen } from './ConsentScreen';

// ─── /coaching/join/<code> (spec §2.3) ────────────────────────────────────────
// previewInvite -> consent screen -> join. Every invite state has copy. A client
// without gym setup is sent to the existing setup first; the code is kept on the
// device and Gym Today offers to carry on. On a phone the page first offers the
// app (`chefer://`). A signed-out phone gets SignedOutInvite instead (the
// middleware rewrites to it), and app builds with universal links / App Links
// open the invite before either page loads.

function Page({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-lg px-4 py-6 sm:px-6 sm:py-10">{children}</div>;
}

function Message({ title, body }: { title: string; body: string }) {
  const { t } = useT();
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
        {t('coaching.join.goToGym')}
      </Link>
    </Page>
  );
}

function stateMessage(preview: InvitePreviewDto, t: Translator['t']): string | null {
  switch (preview.state) {
    case 'OK':
      return null;
    case 'ALREADY_YOURS':
      return t('coaching.inviteState.ALREADY_YOURS', {
        trainer: preview.trainerName ?? t('coaching.yourTrainer.title'),
      });
    case 'EXPIRED':
    case 'USED':
    case 'REVOKED':
    case 'SELF':
    case 'NOT_FOUND':
      return t(`coaching.inviteState.${preview.state}`);
  }
}

export function JoinFlow({ code }: { code: string }) {
  const { t } = useT();
  const router = useRouter();
  const utils = trpc.useUtils();
  // Always fresh: the answer changes while the page is away (gym setup done, link
  // used), and a cached "needs gym setup" would strand a client who just finished it.
  const preview = trpc.coaching.previewInvite.useQuery(
    { code },
    { retry: false, staleTime: 0, gcTime: 0, refetchOnMount: 'always' },
  );
  const [error, setError] = useState<string | null>(null);
  // Lane K1: both off until the client turns them on.
  const [share, setShare] = useState<CoachingShareChoice>(NO_COACHING_SHARE);
  const [joined, setJoined] = useState<string | null>(null);
  const [choice, setChoice] = useState<'ask' | 'web'>('web');

  useEffect(() => {
    if (isMobileUserAgent(navigator.userAgent)) setChoice('ask');
  }, []);

  const join = trpc.coaching.join.useMutation({
    meta: { silent: true },
    onSuccess: (status, vars) => {
      trackSharingChosen(vars.share, 'join');
      clearPendingJoin();
      void utils.coaching.status.invalidate();
      void utils.gym.bootstrap.invalidate();
      void utils.gym.routine.get.invalidate();
      setJoined(
        status.trainer?.name ?? preview.data?.trainerName ?? t('coaching.yourTrainer.title'),
      );
    },
    onError: (err) => setError(userFacingErrorMessage(err)),
  });

  if (joined) {
    return (
      <Page>
        <h1 className="font-serif text-2xl font-bold text-gray-900" data-testid="coaching-joined">
          {t('coaching.consent.joinedTitle', { trainer: joined })}
        </h1>
        <p className="mt-3 text-sm text-gray-700">
          {t('coaching.consent.oneTrainer', { trainer: joined })}
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Button asChild className="min-h-11">
            <Link href="/gym/routine">{t('coaching.join.openMyRoutine')}</Link>
          </Button>
          <Button asChild variant="outline" className="min-h-11">
            <Link href="/profile#your-trainer">{t('coaching.yourTrainer.title')}</Link>
          </Button>
        </div>
      </Page>
    );
  }

  if (preview.isLoading) {
    return (
      <Page>
        <h1 className="sr-only">{t('coaching.join.inviteTitle')}</h1>
        <div className="h-64 animate-pulse rounded-2xl bg-gray-100" aria-hidden="true" />
      </Page>
    );
  }

  // A failed preview (flag off, malformed code, offline) reads like an unknown code:
  // the API answers an off flag with the same NOT_FOUND as a code that never existed.
  if (preview.isError || !preview.data) {
    return (
      <Message title={t('coaching.join.inviteTitle')} body={t('coaching.inviteState.NOT_FOUND')} />
    );
  }

  const data = preview.data;
  const message = stateMessage(data, t);
  if (message !== null) return <Message title={t('coaching.join.inviteTitle')} body={message} />;

  const trainerName = data.trainerName
    ? trainerNameOrFallbackT(data.trainerName, t)
    : t('coaching.yourTrainer.title');

  if (data.needsGymSetup) {
    return (
      <Page>
        <h1 className="font-serif text-2xl font-bold text-gray-900">
          {t('coaching.consent.title', { trainer: trainerName })}
        </h1>
        <p className="mt-3 text-sm text-gray-700">{t('coaching.consent.needsSetup')}</p>
        <Button asChild className="mt-6 min-h-11">
          <Link href="/gym/setup" onClick={() => rememberPendingJoin(code)}>
            {t('coaching.join.setUpTraining')}
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
            {t('coaching.consent.title', { trainer: trainerName })}
          </p>
          <Button asChild className="min-h-11">
            <a href={appJoinUrl(code)}>{t('coaching.consent.openInApp')}</a>
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => setChoice('web')}
          >
            {t('coaching.consent.continueOnWeb')}
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
            // The browser's local day anchors the trainer's 4-week window (not the server's UTC day).
            join.mutate({ code, source: 'web', localDate: localDateStr(), share });
          }}
          share={share}
          onShareChange={(next) => setShare((cur) => ({ ...cur, ...next }))}
          onDecline={() => router.push('/gym')}
        />
      )}
      {choice === 'ask' && (
        <h1 className="sr-only">{t('coaching.consent.title', { trainer: trainerName })}</h1>
      )}
    </Page>
  );
}
