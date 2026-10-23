'use client';

import Link from 'next/link';
import { useTrainerClientsHref } from '@/features/nav/mode-context';
import { ArrowLeft } from 'lucide-react';
import { BOOKING_COPY, COACHING_COPY, COACHING_DATA_COPY } from '@chefer/types';
import { Badge } from '@chefer/ui';
import { cn } from '@chefer/utils';
import { firstName } from '../format';

export type ClientTab = 'routine' | 'workouts' | 'adherence' | 'bookings' | 'food';

/**
 * One client: back to the list, the name (the page's one h1) and the tabs
 * (Routine · Workouts · Adherence, + Bookings in trainer mode). Tabs are links, so each is a real URL.
 * A client in "Keep it simple" gets a badge and a line saying only they can
 * change it: the trainer never has a control for the training style (PRD 2026-10 §4.3).
 */
export function ClientHeader({
  clientId,
  name,
  active,
  keepItSimple = false,
  confirmLeave,
  actions,
  showBookings = false,
  showFood = false,
}: {
  clientId: string;
  name: string;
  active: ClientTab;
  /** The client trains in "Keep it simple" (ClientOverviewDto.client.keepItSimple). */
  keepItSimple?: boolean | undefined;
  /** The routine editor asks before leaving with unsaved changes; return false to stay. */
  confirmLeave?: () => boolean;
  /** Header actions beside the name (trainer mode M2: "Assign a template"). */
  actions?: React.ReactNode;
  /** Trainer mode M3: the Bookings tab (§6.5). */
  showBookings?: boolean;
  /** Lane K2: the Food tab, while the client shares their food log or weight. */
  showFood?: boolean;
}) {
  const guard = (e: React.MouseEvent) => {
    if (confirmLeave && !confirmLeave()) e.preventDefault();
  };
  const clientsHref = useTrainerClientsHref();
  const tabs = COACHING_COPY.trainer.tabs;
  const base = `/trainer/${encodeURIComponent(clientId)}`;
  const items: { key: ClientTab; label: string; href: string }[] = [
    { key: 'routine', label: tabs.routine, href: `${base}/routine` },
    { key: 'workouts', label: tabs.workouts, href: base },
    { key: 'adherence', label: tabs.adherence, href: `${base}?tab=adherence` },
    ...(showFood
      ? [{ key: 'food' as const, label: COACHING_DATA_COPY.tab, href: `${base}?tab=food` }]
      : []),
    ...(showBookings
      ? [
          {
            key: 'bookings' as const,
            label: BOOKING_COPY.clientDetail.tab,
            href: `${base}?tab=bookings`,
          },
        ]
      : []),
  ];
  return (
    <header className="flex flex-col gap-3">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Link
          href={clientsHref}
          onClick={guard}
          aria-label={COACHING_COPY.trainer.clients}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </Link>
        <h1 className="min-w-0 break-words font-serif text-2xl font-bold text-gray-900">{name}</h1>
        {keepItSimple && (
          <Badge variant="info" className="shrink-0" data-testid="trainer-client-simple">
            {COACHING_COPY.trainerProfile.keepItSimple}
          </Badge>
        )}
        {actions && <div className="flex min-w-0 flex-wrap gap-2 sm:ml-auto">{actions}</div>}
      </div>
      {keepItSimple && (
        <p
          className="min-w-0 break-words text-sm text-gray-600"
          data-testid="trainer-client-simple-hint"
        >
          {COACHING_COPY.trainerProfile.keepItSimpleHint(firstName(name))}
        </p>
      )}
      <nav aria-label={name} className="-mx-1 flex gap-1 overflow-x-auto px-1">
        {items.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            onClick={guard}
            aria-current={item.key === active ? 'page' : undefined}
            className={cn(
              'flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-medium',
              item.key === active
                ? 'border-gray-900 bg-gray-900 text-white'
                : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50',
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
