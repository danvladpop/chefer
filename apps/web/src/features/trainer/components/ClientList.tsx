import Link from 'next/link';
import { formatDayWithWeekday, formatShortDay } from '@/features/coaching/lib/dates';
import { ChevronRight } from 'lucide-react';
import { COACHING_COPY, COACHING_LIMITS, type ClientRowDto } from '@chefer/types';
import { Badge, pressCard } from '@chefer/ui';
import { cn } from '@chefer/utils';
import { firstName } from '../format';

// ─── Clients (spec §2.4) ──────────────────────────────────────────────────────
// Desktop-first: one grid row per client at lg+ (columns), a stacked card below.
// One markup for both, so assistive tech reads each client once.

const COLUMNS =
  'lg:grid lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto] lg:items-center lg:gap-4';

export function ClientList({ clients }: { clients: ClientRowDto[] }) {
  const copy = COACHING_COPY.trainer;
  if (clients.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-600">
        {copy.clientsEmpty}
      </p>
    );
  }
  return (
    <div>
      <div
        aria-hidden="true"
        className={cn(
          'hidden px-4 pb-2 text-xs font-semibold uppercase tracking-wide text-gray-500',
          COLUMNS,
        )}
      >
        <span>Client</span>
        <span>Since</span>
        <span>Last workout</span>
        <span>This week</span>
        <span className="w-5" />
      </div>
      <ul className="flex flex-col gap-2" aria-label={copy.clients}>
        {clients.map((client) => {
          const quiet = client.inactiveDays >= COACHING_LIMITS.inactiveDays;
          return (
            <li key={client.clientId}>
              <Link
                href={`/trainer/${encodeURIComponent(client.clientId)}`}
                className={cn(
                  'flex min-h-11 flex-col gap-1 rounded-2xl border bg-white p-4 shadow-sm hover:bg-neutral-50',
                  COLUMNS,
                  pressCard,
                )}
                data-testid="trainer-client-row"
              >
                <span className="min-w-0">
                  <span className="block min-w-0 break-words font-semibold text-gray-900">
                    {client.name}
                  </span>
                  {client.label && (
                    <span className="block min-w-0 break-words text-xs text-gray-500">
                      {client.label}
                    </span>
                  )}
                </span>
                <span className="text-sm text-gray-600">
                  {copy.sinceClient(formatShortDay(client.since))}
                </span>
                <span className="text-sm text-gray-600">
                  {client.lastWorkoutDate
                    ? copy.lastWorkout(formatDayWithWeekday(client.lastWorkoutDate))
                    : copy.noWorkoutYet}
                </span>
                <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-700">
                  <span className="font-medium">
                    {copy.weekProgress(client.week.sessions, client.week.goal)}
                  </span>
                  {quiet && (
                    <Badge variant="secondary" data-testid="trainer-client-quiet">
                      {copy.quiet(client.inactiveDays)}
                    </Badge>
                  )}
                </span>
                <ChevronRight
                  className="hidden h-5 w-5 shrink-0 text-gray-400 lg:block"
                  aria-hidden="true"
                />
                {client.routineChangedByClientAt && (
                  <span
                    className="min-w-0 break-words text-xs font-medium text-amber-800 lg:col-span-5"
                    data-testid="trainer-client-changed"
                  >
                    {copy.routineChangedByClient(
                      firstName(client.name),
                      formatShortDay(client.routineChangedByClientAt),
                    )}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
