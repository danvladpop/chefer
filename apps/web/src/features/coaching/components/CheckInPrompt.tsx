'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { localDate } from '@/features/gym/use-gym-bootstrap';
import { useT } from '@/lib/i18n';
import { trpc } from '@/lib/trpc';
import { X } from 'lucide-react';
import { trainerNameOrFallbackT } from '../lib/copy';
import { useCoachingAvailability } from '../use-coaching-availability';

// ─── "Ana's weekly check-in" (lane K3) ────────────────────────────────────────
// While the trainer's check-in is open and unanswered: Answer opens
// /coaching/check-in; Later hides it until tomorrow in this browser. Only
// asked for a coached client. Mirrors mobile check-in-prompt.tsx.

const LATER_KEY = 'chefer.coaching.check-in-later';

function readLater(): string | null {
  try {
    return window.localStorage.getItem(LATER_KEY);
  } catch {
    return null;
  }
}

export function CheckInPrompt() {
  const { t } = useT();
  const { enabled } = useCoachingAvailability();
  const status = trpc.coaching.status.useQuery(undefined, { enabled, retry: false });
  const today = localDate();
  const [later, setLater] = useState<string | null>(null);
  useEffect(() => setLater(readLater()), []);
  const current = trpc.coaching.checkIn.current.useQuery(
    { today },
    { enabled: enabled && !!status.data?.trainer, retry: false, staleTime: 5 * 60_000 },
  );
  const open = current.data;
  if (!open || open.answered || later === today) return null;
  const title = t('coaching.checkIn.client.cardTitle', {
    trainer: trainerNameOrFallbackT(open.trainerName, t),
  });
  return (
    <div
      className="mb-4 flex min-w-0 items-start gap-2 rounded-xl bg-amber-50 px-3 py-2"
      data-testid="coaching-check-in-prompt"
    >
      <div className="min-w-0 flex-1 py-1">
        <p className="text-sm font-semibold text-gray-900">{title}</p>
        <p className="text-sm text-gray-700">
          {t('coaching.checkIn.client.cardBody', { count: open.questions.length })}
        </p>
        <Link
          href="/coaching/check-in"
          className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline-offset-4 hover:underline"
        >
          {t('coaching.checkIn.client.answer')}
        </Link>
      </div>
      <button
        type="button"
        aria-label={t('coaching.checkIn.client.laterLabel', { title })}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-amber-100"
        onClick={() => {
          try {
            window.localStorage.setItem(LATER_KEY, today);
          } catch {
            // Storage blocked: the card simply comes back on the next visit.
          }
          setLater(today);
        }}
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
