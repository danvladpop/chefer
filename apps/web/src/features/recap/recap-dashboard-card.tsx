'use client';

import Link from 'next/link';
import { useFlags } from '@/features/flags/use-flags';
import { trpc } from '@/lib/trpc';
import { CalendarCheck, ChevronRight } from 'lucide-react';
import { pressCard } from '@chefer/ui';
import { cn, localDateStr, RECAP_COPY } from '@chefer/utils';

// Lane E2: the dashboard's Monday door into "Your week in review" (web twin of
// mobile's RecapTodayCard). Monday only, and only when last week has something
// to show. With the `gamification` flag on, Kitchen progress's recap banner
// owns this slot, so the card hides.

export function RecapDashboardCard({ isMonday }: { isMonday: boolean }) {
  const { gamification } = useFlags();
  const show = isMonday && !gamification;
  const { data } = trpc.recap.week.useQuery(
    { localDate: localDateStr() },
    { enabled: show, staleTime: 10 * 60_000 },
  );
  if (!show || !data || data.empty) return null;
  return (
    <Link
      href="/recap"
      data-testid="dashboard-recap"
      className={cn(
        'flex min-h-11 items-center gap-3 rounded-2xl border bg-white p-4 shadow-sm',
        pressCard,
      )}
    >
      <CalendarCheck className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-gray-900">
          {RECAP_COPY.todayCardTitle} · {data.label}
        </span>
        <span className="block text-xs text-gray-600">{RECAP_COPY.todayCardBody}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
    </Link>
  );
}
