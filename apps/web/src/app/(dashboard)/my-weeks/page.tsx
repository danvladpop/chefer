'use client';

import Link from 'next/link';
import { PlanHistoryCard } from '@/features/history/components/PlanHistoryCard';
import { WeekTemplates } from '@/features/meal-plan/components/WeekTemplates';
import { trpc } from '@/lib/trpc';
import { Clock } from 'lucide-react';
import { ErrorState } from '@chefer/ui';
import { pastWeeks } from '@chefer/utils';

// ─── My weeks (P2-8, PM review §5) ───────────────────────────────────────────
// One page for "weeks I've had": saved weeks (templates) on top, past weeks
// below. It replaces History, which listed future weeks and every regenerate
// as near-identical cards (F-PLAN-6-3): past weeks only, one card per week,
// newest first. /history redirects here.

// The procedure's maximum page. Deduped to one card per week this covers
// most of a year of history, so there is no pagination (F-PLAN-6-2).
const HISTORY_LIMIT = 50;

export default function MyWeeksPage() {
  const { data: currentPlan } = trpc.mealPlan.getForWeek.useQuery(
    { weekOffset: 0 },
    { retry: false, staleTime: 30_000 },
  );
  const {
    data: plans = [],
    isLoading,
    isError,
    isRefetching,
    refetch,
  } = trpc.mealPlan.list.useQuery({ limit: HISTORY_LIMIT, offset: 0 }, { staleTime: 30_000 });

  const weeks = pastWeeks(plans);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:py-8">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
          Your rotation
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">My weeks</h1>
      </div>

      {/* Saved weeks — save this week, follow, rename, delete */}
      <section aria-label="Saved weeks" className="mb-8">
        <WeekTemplates currentPlanId={currentPlan?.planId ?? null} showWhenEmpty />
      </section>

      {/* Past weeks */}
      <section aria-labelledby="past-weeks-heading">
        <h2
          id="past-weeks-heading"
          className="mb-3 text-xs font-semibold uppercase tracking-widest text-neutral-500"
        >
          Past weeks
        </h2>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <div key={i} className="h-40 animate-pulse rounded-2xl bg-neutral-100" />
            ))}
          </div>
        ) : isError && plans.length === 0 ? (
          // A failed load is not an empty history (audit F-X-3-1).
          <ErrorState
            title="Couldn't load your past weeks"
            onRetry={() => void refetch()}
            retrying={isRefetching}
          />
        ) : weeks.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-200 px-4 py-12 text-center">
            <Clock className="mb-3 h-9 w-9 text-neutral-300" aria-hidden="true" />
            <p className="mb-1 font-semibold text-neutral-700">No past weeks yet</p>
            <p className="mb-5 max-w-xs text-sm text-neutral-500">
              Once a planned week is over it shows up here, ready to cook again.
            </p>
            <Link
              href="/meal-plan"
              className="inline-flex min-h-11 items-center rounded-xl bg-primary px-5 text-sm font-medium text-white transition hover:bg-primary/90"
            >
              Go to this week&apos;s plan
            </Link>
          </div>
        ) : (
          <div className="space-y-4" data-testid="past-weeks">
            {weeks.map((plan) => (
              <PlanHistoryCard key={plan.id} plan={plan} onRestored={() => void refetch()} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
