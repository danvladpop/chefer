'use client';

import Link from 'next/link';
import { trpc } from '@/lib/trpc';
import { Info } from 'lucide-react';
import { BOOKING_COPY } from '@chefer/types';
import { Button } from '@chefer/ui';
import { cn } from '@chefer/utils';
import { useCoachingAvailability } from '../use-coaching-availability';

// ─── Consent copy v2, the one-time notice (trainer-mode.md §10, O-7) ──────────
// A client who agreed to the older coaching consent sees what is new ("bookings
// and logged workouts") once, with a way to Leave; "Got it" records the new
// copy version (`coaching.acknowledgeConsentUpdate`). Not a re-consent gate.

export function ConsentUpdateNotice({
  leaveHref = '/profile#your-trainer',
  className,
}: {
  /** Where Leave lives (Your trainer). */
  leaveHref?: string;
  className?: string;
}) {
  const { enabled } = useCoachingAvailability();
  const utils = trpc.useUtils();
  const status = trpc.coaching.status.useQuery(undefined, {
    enabled,
    retry: false,
    staleTime: 60_000,
  });
  const ack = trpc.coaching.acknowledgeConsentUpdate.useMutation({
    meta: { silent: true },
    onSettled: () => void utils.coaching.status.invalidate(),
  });
  const update = enabled ? status.data?.consentUpdate : null;
  if (!update || ack.isPending || ack.isSuccess) return null;
  const copy = BOOKING_COPY.notices;
  return (
    <section
      aria-label={copy.consentUpdate(update.trainerName)}
      className={cn(
        'flex min-w-0 flex-col gap-2 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950',
        className,
      )}
      data-testid="coaching-consent-update"
    >
      <p className="flex min-w-0 items-start gap-2 font-medium">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0 break-words">{copy.consentUpdate(update.trainerName)}</span>
      </p>
      <p className="min-w-0 break-words">{copy.consentUpdateBody(update.trainerName)}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" className="min-h-11" onClick={() => ack.mutate()}>
          {copy.gotIt}
        </Button>
        <Link
          href={leaveHref}
          className="flex min-h-11 items-center rounded-lg px-3 font-semibold underline underline-offset-2 hover:bg-sky-100"
        >
          {copy.leave}
        </Link>
      </div>
    </section>
  );
}
