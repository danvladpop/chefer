'use client';

import Link from 'next/link';
import { PlanHistoryCard } from '@/features/history/components/PlanHistoryCard';
import { trpc } from '@/lib/trpc';
import { Clock } from 'lucide-react';

export default function HistoryPage() {
  const limit = 10;

  const {
    data: plans = [],
    isLoading,
    refetch,
  } = trpc.mealPlan.list.useQuery({ limit, offset: 0 }, { staleTime: 30_000 });

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-neutral-200" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-40 animate-pulse rounded-2xl bg-neutral-100" />
        ))}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
          PAST PLANS
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">History</h1>
      </div>

      {/* Empty state */}
      {plans.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-200 py-16 text-center">
          <Clock className="mb-4 h-10 w-10 text-neutral-300" />
          <h2 className="mb-2 font-semibold text-neutral-700">No past plans yet</h2>
          <p className="mb-6 max-w-xs text-sm text-neutral-500">
            Generate your first meal plan to start building your history.
          </p>
          <Link
            href="/meal-plan"
            className="rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-white transition hover:bg-primary/90"
          >
            Go to Meal Planner
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {plans.map((plan) => (
            <PlanHistoryCard key={plan.id} plan={plan} onRestored={() => void refetch()} />
          ))}

          {plans.length === limit && (
            <button
              onClick={() => void refetch()}
              className="w-full rounded-xl border border-neutral-200 py-3 text-sm font-medium text-neutral-600 transition hover:bg-neutral-50"
            >
              Load more
            </button>
          )}
        </div>
      )}
    </div>
  );
}
