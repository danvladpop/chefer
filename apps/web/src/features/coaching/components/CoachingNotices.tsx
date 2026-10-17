'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { X } from 'lucide-react';
import { clearAllPendingJoins, readPendingJoinPath } from '../lib/pending-join';
import { useCoachingAvailability } from '../use-coaching-availability';
import { NoticeCard, useCoachingNoticeViews } from './CoachingNoticeList';

/**
 * Gym Today: the client's unread coaching notices ("Ana updated your routine",
 * "Ana stopped coaching you", request answers), and "Carry on joining" after
 * the gym setup a join or a coaching request needed.
 */
export function CoachingNotices() {
  const { enabled } = useCoachingAvailability();
  const status = trpc.coaching.status.useQuery(undefined, {
    enabled,
    retry: false,
    staleTime: 60_000,
  });
  const { views, dismiss } = useCoachingNoticeViews('client');
  const [pending, setPending] = useState<string | null>(null);
  useEffect(() => {
    setPending(readPendingJoinPath());
  }, []);

  const joiningPath = enabled && status.data?.trainer == null ? pending : null;
  if (views.length === 0 && !joiningPath) return null;

  return (
    <div className="mb-4 flex flex-col gap-2" data-testid="coaching-notices">
      {views.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label="Coaching notices">
          {views.map((v) => (
            <NoticeCard key={v.id} notice={v} onDismiss={dismiss} />
          ))}
        </ul>
      )}
      {joiningPath && (
        <div className="flex min-w-0 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">
          <Link
            href={joiningPath}
            className="flex min-h-11 min-w-0 flex-1 items-center font-medium underline underline-offset-2"
          >
            Carry on joining your trainer
          </Link>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => {
              clearAllPendingJoins();
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
