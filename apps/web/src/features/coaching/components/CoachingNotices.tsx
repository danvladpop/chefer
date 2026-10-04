'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { UserRound, X } from 'lucide-react';
import { COACHING_COPY, type RoutineDto } from '@chefer/types';
import { formatShortDay } from '../lib/dates';
import { clearPendingJoin, readPendingJoin } from '../lib/pending-join';
import { isRoutineChangeUnseen } from '../lib/routine-seen';
import { useCoachingAvailability } from '../use-coaching-availability';

const DISMISSED_KEY = 'chefer.coaching.stoppedDismissed';

function readDismissed(): string | null {
  try {
    return window.localStorage.getItem(DISMISSED_KEY);
  } catch {
    return null;
  }
}

/**
 * Gym Today: one quiet line per coaching event (spec §2.6, §2.7).
 * - "Ana updated your routine · 2 Oct" until the routine is opened on this device;
 * - "Ana stopped coaching you" (30 days, dismissible) when the trainer ended the link;
 * - "Carry on joining" after the gym setup a join needed.
 */
export function CoachingNotices({ routine }: { routine: RoutineDto | null | undefined }) {
  const { enabled } = useCoachingAvailability();
  const status = trpc.coaching.status.useQuery(undefined, {
    enabled,
    retry: false,
    staleTime: 60_000,
  });
  const [mounted, setMounted] = useState(false);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  useEffect(() => {
    setMounted(true);
    setDismissed(readDismissed());
    setPending(readPendingJoin());
  }, []);

  if (!mounted) return null;

  const changedBy = routine?.lastEditedByOther;
  const changed =
    routine && changedBy && isRoutineChangeUnseen(routine.id, changedBy.at) ? changedBy : null;
  const stoppedNow = status.data?.stopped ?? null;
  const stopped = stoppedNow !== null && dismissed !== stoppedNow.at ? stoppedNow : null;
  const joiningCode = enabled && status.data?.trainer == null ? pending : null;

  if (!changed && !stopped && !joiningCode) return null;

  return (
    <div className="mb-4 flex flex-col gap-2" data-testid="coaching-notices">
      {changed && (
        <Link
          href="/gym/routine"
          className="flex min-h-11 min-w-0 items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
          data-testid="coaching-routine-updated"
        >
          <UserRound className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            {COACHING_COPY.stamps.todayNotice(changed.name, formatShortDay(changed.at))}
          </span>
        </Link>
      )}
      {stopped && (
        <div
          className="flex min-w-0 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
          data-testid="coaching-stopped"
        >
          <UserRound className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            {COACHING_COPY.yourTrainer.stopped(stopped.trainerName)} · {formatShortDay(stopped.at)}
          </span>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => {
              try {
                window.localStorage.setItem(DISMISSED_KEY, stopped.at);
              } catch {
                // Storage blocked: dismissed for this visit only.
              }
              setDismissed(stopped.at);
            }}
            className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}
      {joiningCode && (
        <div className="flex min-w-0 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">
          <Link
            href={`/coaching/join/${joiningCode}`}
            className="flex min-h-11 min-w-0 flex-1 items-center font-medium underline underline-offset-2"
          >
            Carry on joining your trainer
          </Link>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => {
              clearPendingJoin();
              setPending(null);
            }}
            className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
