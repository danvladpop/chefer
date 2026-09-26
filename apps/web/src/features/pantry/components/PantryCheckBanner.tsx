'use client';

import { useState } from 'react';
import { useLocalStorage } from '@/hooks/use-local-storage';
import { useEntitlement } from '@/hooks/useEntitlement';
import { capture } from '@/lib/analytics';
import { trpc } from '@/lib/trpc';
import { Check, ClipboardCheck, X } from 'lucide-react';
import {
  cn,
  PANTRY_CONFIRM_MIN_AGE_DAYS,
  pantryConfirmWeekKey,
  pantryItemsToConfirm,
} from '@chefer/utils';

// ─── "Still have these?" — inline pantry check (F3, audit F-PM-13) ───────────
// The honest v1 depletion model (premium_plan.md §5 W2-E.2): no fake
// per-recipe gram math — a quick "still have these?" pass instead. Tapped
// items are cleared; kept items older than a week decay server-side to the
// "some" state. Fires `pantry_confirmed`.
//
// It used to be a sheet that took over the shopping list on every open, asking
// about items checked off minutes earlier. Now it is an inline banner (the
// list stays usable underneath), it asks at most once a week, and only about
// items that have been in the kitchen for 3+ days. "Not now" counts as
// answered for the week: nudges never nag (§6.5).

const STORAGE_KEY = 'pantry-check-week';

interface PantryCheckBannerProps {
  /** Opened by hand (the "Still have these?" button): shows even if answered this week. */
  manualOpen?: boolean;
  onManualClose?: () => void;
  className?: string;
}

export function PantryCheckBanner({
  manualOpen = false,
  onManualClose,
  className,
}: PantryCheckBannerProps) {
  const { enabled } = useEntitlement('pantryPlanning');
  const { data } = trpc.pantry.list.useQuery(undefined, { enabled, staleTime: 60_000 });
  const [answeredWeek, setAnsweredWeek] = useLocalStorage<string>(STORAGE_KEY, '');
  const [expanded, setExpanded] = useState(false);
  const [clearIds, setClearIds] = useState<Set<string>>(new Set());
  const utils = trpc.useUtils();

  const weekKey = pantryConfirmWeekKey();
  const candidates = pantryItemsToConfirm(data?.items ?? []);
  const autoDue = enabled && candidates.length > 0 && answeredWeek !== weekKey;
  const open = enabled && (manualOpen || autoDue);
  const showItems = manualOpen || expanded;

  const close = () => {
    setAnsweredWeek(weekKey);
    setExpanded(false);
    setClearIds(new Set());
    onManualClose?.();
  };

  const confirmMutation = trpc.pantry.confirmWeekly.useMutation({
    onSuccess: () => {
      capture('pantry_confirmed');
      void utils.pantry.list.invalidate();
      void utils.shoppingList.getForWeek.invalidate();
      close();
    },
  });

  if (!open || !data) return null;

  const toggle = (id: string) => {
    setClearIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <section
      aria-label="Still have these?"
      data-testid="pantry-check-banner"
      data-print-hide
      className={cn('rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3 sm:p-4', className)}
    >
      <div className="flex items-start gap-3">
        <ClipboardCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-emerald-900">Still have these?</p>
          <p className="mt-0.5 text-xs text-emerald-800">
            {candidates.length === 0
              ? `Everything in your kitchen was added in the last ${PANTRY_CONFIRM_MIN_AGE_DAYS} days — nothing to check yet.`
              : showItems
                ? "Tap anything you've used up. Everything else stays in your kitchen."
                : `${candidates.length} item${candidates.length === 1 ? ' has' : 's have'} been in your kitchen for a few days.`}
          </p>
        </div>
        <button
          type="button"
          onClick={close}
          aria-label="Not now"
          className="-m-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-emerald-800 hover:bg-emerald-100"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {candidates.length > 0 && !showItems && (
        <div className="mt-2 flex gap-2 pl-8">
          <button
            type="button"
            data-testid="pantry-check-review"
            onClick={() => setExpanded(true)}
            className="min-h-11 rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800"
          >
            Check them
          </button>
          <button
            type="button"
            onClick={close}
            className="min-h-11 rounded-xl px-3 text-sm font-medium text-emerald-800 hover:bg-emerald-100"
          >
            Not now
          </button>
        </div>
      )}

      {candidates.length > 0 && showItems && (
        <>
          <ul className="mt-3 flex flex-wrap gap-2">
            {candidates.map((item) => {
              const cleared = clearIds.has(item.id);
              return (
                <li key={item.id} className="min-w-0 max-w-full">
                  <button
                    type="button"
                    onClick={() => toggle(item.id)}
                    aria-pressed={cleared}
                    aria-label={`${item.ingredientName}: ${cleared ? 'used up' : 'still have it'}`}
                    className={cn(
                      'flex min-h-11 max-w-full items-center gap-2 rounded-full border px-3 text-left text-sm transition',
                      cleared
                        ? 'border-red-200 bg-red-50 text-red-700 line-through'
                        : 'border-emerald-200 bg-white text-neutral-800 hover:border-emerald-300',
                    )}
                  >
                    {cleared ? (
                      <X className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    ) : (
                      <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden="true" />
                    )}
                    <span className="truncate capitalize">{item.ingredientName}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            data-testid="pantry-check-done"
            onClick={() => confirmMutation.mutate({ clearIds: [...clearIds] })}
            disabled={confirmMutation.isPending}
            className="mt-3 min-h-11 w-full rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-50 sm:w-auto"
          >
            {confirmMutation.isPending
              ? 'Updating your kitchen…'
              : clearIds.size > 0
                ? `Done — clear ${clearIds.size} item${clearIds.size !== 1 ? 's' : ''}`
                : 'Done — I still have everything'}
          </button>
          {confirmMutation.isError && (
            <p className="mt-2 text-xs text-red-600">{confirmMutation.error.message}</p>
          )}
        </>
      )}
    </section>
  );
}
