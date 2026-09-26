'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { cn } from '@chefer/utils';

// "Plan my week every Sunday" (audit F-PLAN-4-3): the premium Sunday worker
// used to run with no way to opt out. A followed "My weeks" template always
// wins over a fresh plan, so the copy says so.

export function AutoPlanToggle({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const mutation = trpc.preferences.setAutoPlanWeekly.useMutation({
    onSuccess: (res) => setEnabled(res.autoPlanWeekly),
    onError: () => setEnabled((v) => !v), // roll back the optimistic flip
  });

  const toggle = () => {
    const next = !enabled;
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
            Your chef prepares next week on Sunday morning. If you follow a saved week in My weeks,
            that week repeats instead.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-labelledby="auto-plan-label"
          disabled={mutation.isPending}
          onClick={toggle}
          className="flex min-h-11 min-w-11 shrink-0 items-center justify-center disabled:opacity-60"
        >
          <span
            className={cn(
              'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
              enabled ? 'bg-[#944a00]' : 'bg-gray-300',
            )}
          >
            <span
              className={cn(
                'inline-block h-5 w-5 rounded-full bg-white shadow transition-transform',
                enabled ? 'translate-x-5' : 'translate-x-0.5',
              )}
            />
          </span>
        </button>
      </div>
      {mutation.isError && (
        <p role="alert" className="mt-2 text-xs text-red-600">
          Couldn&apos;t save that. Try again.
        </p>
      )}
    </section>
  );
}
