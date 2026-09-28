'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Switch } from '@chefer/ui';

// "Show calories and macros on Today" (UX-04, T-04.5/T-04.7). An explicit
// choice overrides the goal-derived default (B-31) either way — a
// goal-having user may still prefer a plainer Today, and someone without a
// goal who just wants the numbers can turn it on.

export function HomeDisplayToggle({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const utils = trpc.useUtils();
  const mutation = trpc.preferences.setHomeDisplay.useMutation({
    onSuccess: (res) => {
      setEnabled(res.showNutritionOnToday);
      void utils.preferences.invalidate();
      void utils.dashboard.invalidate();
    },
    onError: () => setEnabled((v) => !v), // roll back the optimistic flip
  });

  const toggle = (next: boolean) => {
    setEnabled(next);
    mutation.mutate({ showNutritionOnToday: next });
  };

  return (
    <section className="mt-8 rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id="home-display-label" className="font-semibold text-gray-900">
            Show calories and macros on Today
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Off: Today shows your meals and workouts, without numbers.
          </p>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={toggle}
          aria-labelledby="home-display-label"
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
