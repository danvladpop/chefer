'use client';

import Link from 'next/link';
import { useState } from 'react';
import { showAppToast } from '@/lib/app-toast';
import { trpc } from '@/lib/trpc';
import { ChevronRight, Search, UserRound } from 'lucide-react';
import { COACHING_COPY, type CoachingRequestDto } from '@chefer/types';
import { Button, pressCard, Sheet } from '@chefer/ui';
import { cn, userFacingErrorMessage } from '@chefer/utils';
import { formatShortDay } from '../lib/dates';
import { useCoachingAvailability } from '../use-coaching-availability';

// ─── Profile → Your trainer (spec §2.3 step 5, §2.6; PRD 2026-10 §4.1) ────────

/** The client's pending coaching request: who, until when, and Cancel request. */
function PendingRequest({ request }: { request: CoachingRequestDto }) {
  const utils = trpc.useUtils();
  const copy = COACHING_COPY.request;
  const cancel = trpc.coaching.cancelRequest.useMutation({
    meta: { silent: true },
    onSuccess: () => {
      void utils.coaching.status.invalidate();
      void utils.coaching.trainerCard.invalidate();
      showAppToast({ message: copy.cancelled, type: 'success' });
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
          {copy.pending(request.trainer.name)}
        </p>
        <p className="text-sm text-gray-600">{copy.expires(formatShortDay(request.expiresAt))}</p>
      </div>
      <Button
        type="button"
        variant="outline"
        className="min-h-11 shrink-0"
        loading={cancel.isPending}
        onClick={() => cancel.mutate({ source: 'web' })}
      >
        {copy.cancel}
      </Button>
    </div>
  );
}

/** "Find a trainer": the way in for a client without a trainer or a request. */
function FindTrainerEntry() {
  const copy = COACHING_COPY.find;
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
        <span className="block font-medium text-gray-900">{copy.entry}</span>
        <span className="block text-sm text-gray-600">{copy.entryHint}</span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-gray-400" aria-hidden="true" />
    </Link>
  );
}

export function YourTrainerCard() {
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
      showAppToast({ message: COACHING_COPY.yourTrainer.left, type: 'success' });
    },
    onError: (err) => showAppToast({ message: userFacingErrorMessage(err) }),
  });

  if (!enabled || !status.data) return null;
  const { trainer, stopped } = status.data;
  const request = status.data.request ?? null;
  const copy = COACHING_COPY.yourTrainer;

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
            {copy.title}
          </h2>
          <p className="min-w-0 break-words text-sm text-gray-600">
            {trainer ? copy.since(trainer.name, formatShortDay(trainer.since)) : copy.noTrainer}
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
          <div>
            <h3 className="text-sm font-semibold text-gray-900">
              {copy.seesHeading(trainer.name)}
            </h3>
            <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-gray-700">
              {COACHING_COPY.consent.willSee.map((line) => (
                <li key={line} className="min-w-0 break-words">
                  {line}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">{copy.canHeading(trainer.name)}</h3>
            <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-gray-700">
              {COACHING_COPY.consent.can(trainer.name).map((line) => (
                <li key={line} className="min-w-0 break-words">
                  {line}
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-sm text-gray-700">
              {COACHING_COPY.consent.privateNotes(trainer.name)}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => setConfirming(true)}
          >
            {copy.leave}
          </Button>
        </div>
      ) : (
        <div className="mt-3 space-y-1 text-sm text-gray-600">
          {stopped && (
            <p className="font-medium text-gray-800" data-testid="your-trainer-stopped">
              {copy.stopped(stopped.trainerName)} · {formatShortDay(stopped.at)}
            </p>
          )}
          <p>{copy.noTrainerHint}</p>
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
          title={copy.leaveTitle(trainer.name)}
          size="sm"
          footer={
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirming(false)}
                disabled={leave.isPending}
              >
                {COACHING_COPY.common.cancel}
              </Button>
              <Button
                type="button"
                onClick={() => leave.mutate({ source: 'web' })}
                loading={leave.isPending}
              >
                {copy.leaveConfirm}
              </Button>
            </div>
          }
        >
          <p className="px-5 py-4 text-sm text-gray-600">{copy.leaveBody(trainer.name)}</p>
        </Sheet>
      )}
    </section>
  );
}
