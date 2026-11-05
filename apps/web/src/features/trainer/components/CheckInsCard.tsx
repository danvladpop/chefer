'use client';

import { useState } from 'react';
import { localDate } from '@/features/gym/use-gym-bootstrap';
import { trpc } from '@/lib/trpc';
import { CHECK_IN_COPY } from '@chefer/types';
import { Button } from '@chefer/ui';
import { checkInAnswersLine, formatDayWithWeekday } from '@chefer/utils';

// ─── Client › Check-ins (lane K3) ─────────────────────────────────────────────
// The client's answers to the weekly check-in, newest first (3, then Show
// more), and this week's state. Mirrors mobile check-ins-card.tsx.

export function CheckInsCard({ clientId, firstName }: { clientId: string; firstName: string }) {
  const copy = CHECK_IN_COPY.trainer;
  const [all, setAll] = useState(false);
  const checkIns = trpc.trainer.client.checkIns.useQuery(
    { clientId, today: localDate() },
    { retry: false, staleTime: 30_000 },
  );
  // A failed read (an older API, a client who just left) hides the card.
  if (checkIns.isPending || checkIns.isError) return null;
  const { enabled, current, items } = checkIns.data;
  if (!enabled && items.length === 0) return null;
  const shown = all ? items : items.slice(0, 3);
  return (
    <section
      aria-labelledby="trainer-check-ins-title"
      data-testid="trainer-check-ins"
      className="flex flex-col gap-3 rounded-2xl border bg-white p-4 shadow-sm"
    >
      <h2 id="trainer-check-ins-title" className="font-semibold text-gray-900">
        {copy.cardTitle}
      </h2>
      {current && !current.answered && (
        <p className="text-sm text-gray-600" data-testid="trainer-check-ins-waiting">
          {copy.waiting(firstName)}
        </p>
      )}
      {items.length === 0 && <p className="text-sm text-gray-600">{copy.none(firstName)}</p>}
      <ul className="flex flex-col divide-y">
        {shown.map((item) => (
          <li
            key={item.periodStart}
            className="py-2"
            data-testid={`trainer-check-in-${item.periodStart}`}
          >
            <p className="text-sm font-semibold text-gray-900">
              {copy.week(formatDayWithWeekday(item.periodStart))}
            </p>
            <p className="text-sm text-gray-800">
              {checkInAnswersLine(item.questions, item.answers)}
            </p>
            {item.note && (
              <p className="min-w-0 break-words text-sm text-gray-600">“{item.note}”</p>
            )}
          </li>
        ))}
      </ul>
      {!all && items.length > 3 && (
        <Button type="button" variant="outline" className="min-h-11" onClick={() => setAll(true)}>
          {copy.showMore}
        </Button>
      )}
    </section>
  );
}
