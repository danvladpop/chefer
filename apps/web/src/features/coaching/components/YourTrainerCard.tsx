'use client';

import Link from 'next/link';
import { useState } from 'react';
import { showAppToast } from '@/lib/app-toast';
import { useT } from '@/lib/i18n';
import { trpc } from '@/lib/trpc';
import { ChevronRight, Search, UserRound } from 'lucide-react';
import type { CoachingRequestDto } from '@chefer/types';
import { Button, pressCard, Sheet } from '@chefer/ui';
import { cn, userFacingErrorMessage } from '@chefer/utils';
import { consentCanLines, consentWillSeeLines, trainerNameOrFallbackT } from '../lib/copy';
import { formatShortDayT } from '../lib/dates';
import { useCoachingAvailability } from '../use-coaching-availability';
import { UpcomingBookingsList } from './ClientBookings';
import { ConsentUpdateNotice } from './ConsentUpdateNotice';
import { SharingCard } from './SharingCard';

// ─── Profile → Your trainer (spec §2.3 step 5, §2.6; PRD 2026-10 §4.1) ────────

/** The client's pending coaching request: who, until when, and Cancel request. */
function PendingRequest({ request }: { request: CoachingRequestDto }) {
  const { t } = useT();
  const utils = trpc.useUtils();
  const cancel = trpc.coaching.cancelRequest.useMutation({
    meta: { silent: true },
    onSuccess: () => {
      void utils.coaching.status.invalidate();
      void utils.coaching.trainerCard.invalidate();
      showAppToast({ message: t('coaching.request.cancelled'), type: 'success' });
    },
    onError: (err) => showAppToast({ message: userFacingErrorMessage(err) }),
  });
  return (
    <div
      className="flex flex-col gap-2 rounded-xl bg-gray-50 p-3 sm:flex-row sm:items-center sm:justify-between"
      data-testid="your-trainer-request"
    >
      <div className="min-w-0">
        <p className="min-w-0 break-words text-sm font-medium text-gray-900">
          {t('coaching.request.pending', {
            trainer: trainerNameOrFallbackT(request.trainer.name, t),
          })}
        </p>
        <p className="text-sm text-gray-600">
          {t('coaching.request.expires', { date: formatShortDayT(request.expiresAt, t) })}
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        className="min-h-11 shrink-0"
        loading={cancel.isPending}
        onClick={() => cancel.mutate({ source: 'web' })}
      >
        {t('coaching.request.cancel')}
      </Button>
    </div>
  );
}

/** "Find a trainer": the way in for a client without a trainer or a request. */
function FindTrainerEntry() {
  const { t } = useT();
  return (
    <Link
      href="/coaching/find"
      className={cn(
        'flex min-h-11 min-w-0 items-center gap-3 rounded-xl border bg-white p-3 hover:bg-neutral-50',
        pressCard,
      )}
      data-testid="find-trainer-entry"
    >
      <Search className="h-5 w-5 shrink-0 text-gray-500" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-gray-900">{t('coaching.find.entry')}</span>
        <span className="block text-sm text-gray-600">{t('coaching.find.entryHint')}</span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-gray-400" aria-hidden="true" />
    </Link>
  );
}

export function YourTrainerCard() {
  const { t } = useT();
  const { enabled } = useCoachingAvailability();
  const utils = trpc.useUtils();
  const status = trpc.coaching.status.useQuery(undefined, { enabled, retry: false });
  const [confirming, setConfirming] = useState(false);

  const leave = trpc.coaching.leave.useMutation({
    meta: { silent: true },
    onSuccess: () => {
      setConfirming(false);
      void utils.coaching.status.invalidate();
      void utils.gym.bootstrap.invalidate();
      showAppToast({ message: t('coaching.yourTrainer.left'), type: 'success' });
    },
    onError: (err) => showAppToast({ message: userFacingErrorMessage(err) }),
  });

  if (!enabled || !status.data) return null;
  const { trainer, stopped } = status.data;
  const request = status.data.request ?? null;
  const trainerName = trainer ? trainerNameOrFallbackT(trainer.name, t) : '';

  return (
    <section
      id="your-trainer"
      aria-labelledby="your-trainer-title"
      className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5"
      data-testid="your-trainer-card"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#fff3e8] text-[#944a00]">
          <UserRound className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="your-trainer-title" className="font-semibold text-gray-900">
            {t('coaching.yourTrainer.title')}
          </h2>
          <p className="min-w-0 break-words text-sm text-gray-600">
            {trainer
              ? t('coaching.yourTrainer.since', {
                  trainer: trainerName,
                  date: formatShortDayT(trainer.since, t),
                })
              : t('coaching.yourTrainer.noTrainer')}
          </p>
        </div>
      </div>

      {request && (
        <div className="mt-4">
          <PendingRequest request={request} />
        </div>
      )}

      {trainer ? (
        <div className="mt-4 space-y-4">
          {/* Trainer mode M3: the one-time consent v2 notice (§10) and the client's bookings (§6.9). */}
          <ConsentUpdateNotice leaveHref="#your-trainer-leave" />
          <UpcomingBookingsList />
          <div>
            <h3 className="text-sm font-semibold text-gray-900">
              {t('coaching.yourTrainer.seesHeading', { trainer: trainerName })}
            </h3>
            <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-gray-700">
              {consentWillSeeLines(t).map((line) => (
                <li key={line} className="min-w-0 break-words">
                  {line}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">
              {t('coaching.yourTrainer.canHeading', { trainer: trainerName })}
            </h3>
            <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-gray-700">
              {consentCanLines(trainerName, t).map((line) => (
                <li key={line} className="min-w-0 break-words">
                  {line}
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-sm text-gray-700">
              {t('coaching.consent.privateNotes', { trainer: trainerName })}
            </p>
          </div>
          <SharingCard trainerName={trainerName} sharing={trainer.sharing} />
          <Button
            id="your-trainer-leave"
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => setConfirming(true)}
          >
            {t('coaching.yourTrainer.leave')}
          </Button>
        </div>
      ) : (
        <div className="mt-3 space-y-1 text-sm text-gray-600">
          {stopped && (
            <p className="font-medium text-gray-800" data-testid="your-trainer-stopped">
              {t('coaching.yourTrainer.stopped', {
                trainer: trainerNameOrFallbackT(stopped.trainerName, t),
              })}{' '}
              · {formatShortDayT(stopped.at, t)}
            </p>
          )}
          <p>{t('coaching.yourTrainer.noTrainerHint')}</p>
          {!request && (
            <div className="pt-2">
              <FindTrainerEntry />
            </div>
          )}
        </div>
      )}

      {trainer && (
        <Sheet
          open={confirming}
          onClose={() => setConfirming(false)}
          title={t('coaching.yourTrainer.leaveTitle', { trainer: trainerName })}
          size="sm"
          footer={
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirming(false)}
                disabled={leave.isPending}
              >
                {t('coaching.common.cancel')}
              </Button>
              <Button
                type="button"
                onClick={() => leave.mutate({ source: 'web' })}
                loading={leave.isPending}
              >
                {t('coaching.yourTrainer.leaveConfirm')}
              </Button>
            </div>
          }
        >
          <p className="px-5 py-4 text-sm text-gray-600">
            {t('coaching.yourTrainer.leaveBody', { trainer: trainerName })}
          </p>
        </Sheet>
      )}
    </section>
  );
}
