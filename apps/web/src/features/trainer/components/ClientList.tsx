'use client';

import Link from 'next/link';
import { formatDayWithWeekdayT, formatShortDayT } from '@/features/coaching/lib/dates';
import { useT } from '@/lib/i18n';
import { ChevronRight } from 'lucide-react';
import type { ClientRowDto } from '@chefer/types';
import { Badge, pressCard } from '@chefer/ui';
import {
  clientRowNextBooking,
  cn,
  deviceTimeZone,
  isQuietClient,
  quietDaysOf,
  todayIn,
} from '@chefer/utils';
import { firstName } from '../format';

// ─── Clients (spec §2.4) ──────────────────────────────────────────────────────
// Desktop-first: one grid row per client at lg+ (columns), a stacked card below.
// One markup for both, so assistive tech reads each client once.

const COLUMNS =
  'lg:grid lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto] lg:items-center lg:gap-4';

export function ClientList({ clients }: { clients: ClientRowDto[] }) {
  const { t } = useT();
  const timeZone = deviceTimeZone();
  const today = todayIn(timeZone);
  if (clients.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-600">
        {t('coaching.trainer.clientsEmpty')}
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
        <span>{t('coaching.trainer.columns.client')}</span>
        <span>{t('coaching.trainer.columns.since')}</span>
        <span>{t('coaching.trainer.columns.lastWorkout')}</span>
        <span>{t('coaching.trainer.columns.thisWeek')}</span>
        <span className="w-5" />
      </div>
      <ul className="flex flex-col gap-2" aria-label={t('coaching.trainer.clients')}>
        {clients.map((client) => {
          // Lane K4: the server's verdict by the trainer's own N (food included while shared).
          const quiet = isQuietClient(client);
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
                  <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="min-w-0 break-words font-semibold text-gray-900">
                      {client.name}
                    </span>
                    {client.keepItSimple && (
                      <Badge variant="info" data-testid="trainer-client-simple">
                        {t('coaching.trainer.profile.keepItSimple')}
                      </Badge>
                    )}
                  </span>
                  {client.label && (
                    <span className="block min-w-0 break-words text-xs text-gray-500">
                      {client.label}
                    </span>
                  )}
                </span>
                <span className="text-sm text-gray-600">
                  {t('coaching.trainer.sinceClient', { date: formatShortDayT(client.since, t) })}
                </span>
                <span className="text-sm text-gray-600">
                  {client.lastWorkoutDate
                    ? t('coaching.trainer.lastWorkout', {
                        date: formatDayWithWeekdayT(client.lastWorkoutDate, t),
                      })
                    : t('coaching.trainer.noWorkoutYet')}
                </span>
                <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-700">
                  <span className="font-medium">
                    {t('coaching.trainer.weekProgress', {
                      sessions: client.week.sessions,
                      goal: client.week.goal,
                    })}
                  </span>
                  {quiet && (
                    <Badge variant="secondary" data-testid="trainer-client-quiet">
                      {t('coaching.trainer.quiet', { count: quietDaysOf(client) })}
                    </Badge>
                  )}
                </span>
                <ChevronRight
                  className="hidden h-5 w-5 shrink-0 text-gray-400 lg:block"
                  aria-hidden="true"
                />
                {client.nextBookingAt && (
                  <span
                    className="min-w-0 break-words text-sm text-gray-700 lg:col-span-5"
                    data-testid="trainer-client-next-booking"
                  >
                    {clientRowNextBooking(client, timeZone, today)}
                  </span>
                )}
                {client.routineChangedByClientAt && (
                  <span
                    className="min-w-0 break-words text-xs font-medium text-amber-800 lg:col-span-5"
                    data-testid="trainer-client-changed"
                  >
                    {t('coaching.trainer.routineChangedByClient', {
                      name: firstName(client.name),
                      date: formatShortDayT(client.routineChangedByClientAt, t),
                    })}
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
