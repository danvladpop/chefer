'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Switch } from '@chefer/ui';

// "Plan my week every Sunday" (audit F-PLAN-4-3): the Sunday worker used to
// run with no way to opt out. Every tier since P2-5 — premium gets a week
// the chef learned from their ratings, free a fresh curated week. A followed
// "My weeks" template always wins over a fresh plan, so the copy says so.

export function AutoPlanToggle({
  initialEnabled,
  isPremium = true,
}: {
  initialEnabled: boolean;
  isPremium?: boolean;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const mutation = trpc.preferences.setAutoPlanWeekly.useMutation({
    onSuccess: (res) => setEnabled(res.autoPlanWeekly),
    onError: () => setEnabled((v) => !v), // roll back the optimistic flip
  });

  const toggle = (next: boolean) => {
    setEnabled(next);
    mutation.mutate({ enabled: next });
  };

  return (
    <section className="mt-8 rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id="auto-plan-label" className="font-semibold text-gray-900">
            Plan my week every Sunday
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            {isPremium
              ? 'Your chef prepares next week on Sunday morning, learning from what you rate.'
              : 'We pick a fresh week of recipes for you on Sunday morning, matched to your allergies and targets.'}{' '}
            If you follow a saved week in My weeks, that week repeats instead.
          </p>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={toggle}
          aria-labelledby="auto-plan-label"
          disabled={mutation.isPending}
        />
      </div>
      {mutation.isError && (
        <p role="alert" className="mt-2 text-xs text-red-600">
          Couldn&apos;t save that. Try again.
        </p>
      )}
    </section>
  );
}
