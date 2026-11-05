'use client';

import Link from 'next/link';
import { useState } from 'react';
import { trackSharingChosen } from '@/lib/analytics-events';
import { showAppToast } from '@/lib/app-toast';
import { useT } from '@/lib/i18n';
import { trpc } from '@/lib/trpc';
import { ArrowLeft } from 'lucide-react';
import { NO_COACHING_SHARE, type CoachingShareChoice, type TrainerCardDto } from '@chefer/types';
import { Button } from '@chefer/ui';
import { localDateStr, userFacingErrorMessage } from '@chefer/utils';
import { trainerNameOrFallbackT } from '../lib/copy';
import { formatShortDayT } from '../lib/dates';
import { clearPendingTrainer, rememberPendingTrainer } from '../lib/pending-join';
import { ConsentScreen } from './ConsentScreen';
import { TrainerNameBlock } from './TrainerBadge';

// ─── /coaching/trainers/[trainerId] (PRD 2026-10 §4.1) ────────────────────────
// The trainer's card → "Ask to coach me" → the consent screen → request sent.
// Anyone who is not a findable trainer (or is blocked either way) gets the one
// uniform "This trainer isn't available".

function Page({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-lg px-4 py-6 sm:px-6 sm:py-10">{children}</div>;
}

function BackToFind() {
  const { t } = useT();
  return (
    <Link
      href="/coaching/find"
      className="-ml-2 mb-3 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      {t('coaching.find.title')}
    </Link>
  );
}

function isNotFound(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('data' in error)) return false;
  const { data } = error as { data?: { code?: string } };
  return data?.code === 'NOT_FOUND';
}

/** What the card offers under the name, by relation (and why "Ask" is not there). */
function CardAction({
  card,
  expiresAt,
  onAsk,
  onCancel,
  cancelling,
}: {
  card: TrainerCardDto;
  expiresAt: string | null;
  onAsk: () => void;
  onCancel: () => void;
  cancelling: boolean;
}) {
  const { t } = useT();
  const trainer = trainerNameOrFallbackT(card.name, t);
  if (card.relation === 'YOUR_TRAINER') {
    return (
      <div className="flex flex-col gap-3" data-testid="trainer-card-yours">
        <p className="text-sm font-medium text-gray-900">
          {t('coaching.request.yourTrainer', { trainer })}
        </p>
        <Button asChild variant="outline" className="min-h-11 self-start">
          <Link href="/profile#your-trainer">{t('coaching.yourTrainer.title')}</Link>
        </Button>
      </div>
    );
  }
  if (card.relation === 'REQUESTED') {
    return (
      <div className="flex flex-col gap-3" data-testid="trainer-card-requested">
        <div>
          <p className="text-sm font-medium text-gray-900">
            {t('coaching.request.pending', { trainer })}
          </p>
          {expiresAt && (
            <p className="text-sm text-gray-600">
              {t('coaching.request.expires', { date: formatShortDayT(expiresAt, t) })}
            </p>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 self-start"
          loading={cancelling}
          onClick={onCancel}
        >
          {t('coaching.request.cancel')}
        </Button>
      </div>
    );
  }
  if (!card.acceptingClients) {
    return (
      <p className="text-sm font-medium text-gray-900" data-testid="trainer-card-not-taking">
        {t('coaching.find.notTaking')}
      </p>
    );
  }
  if (card.pendingRequestTo) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-gray-900" data-testid="trainer-card-other-pending">
          {t('coaching.request.otherPending', {
            trainer: trainerNameOrFallbackT(card.pendingRequestTo, t),
          })}
        </p>
        <Button asChild variant="outline" className="min-h-11 self-start">
          <Link href="/profile#your-trainer">{t('coaching.yourTrainer.title')}</Link>
        </Button>
      </div>
    );
  }
  if (card.needsGymSetup) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-gray-700">{t('coaching.consent.needsSetup')}</p>
        <Button asChild className="min-h-11 self-start">
          <Link href="/gym/setup" onClick={() => rememberPendingTrainer(card.trainerId)}>
            {t('coaching.join.setUpTraining')}
          </Link>
        </Button>
      </div>
    );
  }
  return (
    <Button type="button" className="min-h-11 self-start" onClick={onAsk}>
      {t('coaching.request.ask')}
    </Button>
  );
}

export function TrainerProfileView({ trainerId }: { trainerId: string }) {
  const { t } = useT();
  const utils = trpc.useUtils();
  // Always fresh: relation and gym setup change while the page is away.
  const card = trpc.coaching.trainerCard.useQuery(
    { trainerId },
    { retry: false, staleTime: 0, refetchOnMount: 'always' },
  );
  const status = trpc.coaching.status.useQuery(undefined, { retry: false });
  const [step, setStep] = useState<'card' | 'consent' | 'sent'>('card');
  const [error, setError] = useState<string | null>(null);
  // Lane K1: both off until the client turns them on.
  const [share, setShare] = useState<CoachingShareChoice>(NO_COACHING_SHARE);

  const refresh = () => {
    void utils.coaching.trainerCard.invalidate({ trainerId });
    void utils.coaching.status.invalidate();
  };
  const request = trpc.coaching.requestCoaching.useMutation({
    meta: { silent: true },
    onSuccess: (_request, vars) => {
      trackSharingChosen(vars.share, 'request');
      clearPendingTrainer();
      setStep('sent');
      refresh();
    },
    onError: (err) => setError(userFacingErrorMessage(err)),
  });
  const cancel = trpc.coaching.cancelRequest.useMutation({
    meta: { silent: true },
    onSuccess: () => {
      refresh();
      showAppToast({ message: t('coaching.request.cancelled'), type: 'success' });
    },
    onError: (err) => showAppToast({ message: userFacingErrorMessage(err) }),
  });

  if (card.isLoading) {
    return (
      <Page>
        <h1 className="sr-only">{t('coaching.find.title')}</h1>
        <div className="h-48 animate-pulse rounded-2xl bg-gray-100" aria-hidden="true" />
      </Page>
    );
  }

  if (card.isError || !card.data) {
    const notFound = !card.isError || isNotFound(card.error);
    return (
      <Page>
        <BackToFind />
        <h1 className="font-serif text-2xl font-bold text-gray-900">{t('coaching.find.title')}</h1>
        <p role="alert" className="mt-3 text-sm text-gray-700" data-testid="trainer-unavailable">
          {notFound ? t('coaching.find.unavailable') : userFacingErrorMessage(card.error)}
        </p>
        {!notFound && (
          <Button
            type="button"
            variant="outline"
            className="mt-4 min-h-11"
            onClick={() => void card.refetch()}
          >
            {t('coaching.common.retry')}
          </Button>
        )}
      </Page>
    );
  }

  const trainer = card.data;
  const trainerName = trainerNameOrFallbackT(trainer.name, t);

  if (step === 'sent') {
    return (
      <Page>
        <h1
          className="font-serif text-2xl font-bold text-gray-900"
          data-testid="coaching-request-sent"
        >
          {t('coaching.request.sent', { trainer: trainerName })}
        </h1>
        <p className="mt-3 text-sm text-gray-700">
          {t('coaching.request.pending', { trainer: trainerName })}
        </p>
        <Button asChild variant="outline" className="mt-6 min-h-11">
          <Link href="/profile#your-trainer">{t('coaching.yourTrainer.title')}</Link>
        </Button>
      </Page>
    );
  }

  if (step === 'consent') {
    return (
      <Page>
        <ConsentScreen
          title={t('coaching.request.askTitle', { trainer: trainerName })}
          trainerName={trainerName}
          currentTrainerName={trainer.currentTrainerName}
          switchNote={
            trainer.currentTrainerName
              ? t('coaching.request.switchNote', {
                  current: trainer.currentTrainerName,
                  trainer: trainerName,
                })
              : null
          }
          footnote={t('coaching.request.noFollow')}
          allowLabel={t('coaching.request.sendConsent')}
          busy={request.isPending}
          error={error}
          onAllow={() => {
            setError(null);
            // The browser's local day anchors the coaching's start if the trainer accepts.
            request.mutate({ trainerId, source: 'web', localDate: localDateStr(), share });
          }}
          share={share}
          onShareChange={(next) => setShare((cur) => ({ ...cur, ...next }))}
          onDecline={() => {
            setError(null);
            setStep('card');
          }}
        />
      </Page>
    );
  }

  const pending = status.data?.request;
  const expiresAt = pending?.trainer.id === trainerId ? pending.expiresAt : null;

  return (
    <Page>
      <BackToFind />
      <section className="flex flex-col gap-4 rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
        <TrainerNameBlock
          as="h1"
          name={trainer.name}
          gymLine={trainer.gymLine}
          nameClassName="font-serif text-2xl font-bold"
        />
        <CardAction
          card={trainer}
          expiresAt={expiresAt}
          onAsk={() => setStep('consent')}
          onCancel={() => cancel.mutate({ source: 'web' })}
          cancelling={cancel.isPending}
        />
        <p className="text-xs text-gray-500">{t('coaching.find.unverified')}</p>
      </section>
    </Page>
  );
}
