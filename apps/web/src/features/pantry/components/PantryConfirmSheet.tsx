'use client';

import { useEffect, useState } from 'react';
import { useLocalStorage } from '@/hooks/use-local-storage';
import { useEntitlement } from '@/hooks/useEntitlement';
import { capture } from '@/lib/analytics';
import { trpc } from '@/lib/trpc';
import { Check, X } from 'lucide-react';
import { Sheet } from '@chefer/ui';
import { cn } from '@chefer/utils';

// ─── Weekly pantry confirm (F3) ──────────────────────────────────────────────
// The honest v1 depletion model (premium_plan.md §5 W2-E.2): no fake
// per-recipe gram math — a 60-second "still have these?" pass instead.
// Tapped items are cleared; kept items older than a week decay server-side to
// the "some" state. Auto-opens once per week (Sunday or the week's first
// visit) for premium accounts with pantry items; fires `pantry_confirmed`.

function currentWeekKey(): string {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() + (day === 0 ? -6 : 1 - day));
  return monday.toISOString().slice(0, 10);
}

export function PantryConfirmSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data } = trpc.pantry.list.useQuery(undefined, { enabled: open, staleTime: 30_000 });
  const [clearIds, setClearIds] = useState<Set<string>>(new Set());
  const utils = trpc.useUtils();

  const confirmMutation = trpc.pantry.confirmWeekly.useMutation({
    onSuccess: () => {
      capture('pantry_confirmed');
      setClearIds(new Set());
      void utils.pantry.list.invalidate();
      void utils.shoppingList.getForWeek.invalidate();
      onClose();
    },
  });

  const toggle = (id: string) => {
    setClearIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const items = data?.items ?? [];

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Still have these?"
      description="Tap anything you've used up — everything else stays in your kitchen."
      size="md"
      footer={
        <button
          type="button"
          onClick={() => confirmMutation.mutate({ clearIds: [...clearIds] })}
          disabled={confirmMutation.isPending}
          className="min-h-11 w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:opacity-50"
        >
          {confirmMutation.isPending
            ? 'Updating your kitchen…'
            : clearIds.size > 0
              ? `Done — clear ${clearIds.size} item${clearIds.size !== 1 ? 's' : ''}`
              : 'Done — I still have everything'}
        </button>
      }
    >
      <div className="space-y-2 px-5 pb-4">
        {items.length === 0 && (
          <p className="py-6 text-center text-sm text-neutral-500">
            Nothing tracked yet — check off shopping list items and they land here.
          </p>
        )}
        {items.map((item) => {
          const cleared = clearIds.has(item.id);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => toggle(item.id)}
              aria-pressed={cleared}
              className={cn(
                'flex min-h-11 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition',
                cleared
                  ? 'border-red-200 bg-red-50 opacity-80'
                  : 'border-neutral-200 bg-white hover:border-neutral-300',
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2',
                  cleared
                    ? 'border-red-400 bg-red-400 text-white'
                    : 'border-emerald-300 text-emerald-500',
                )}
              >
                {cleared ? <X className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    'block truncate text-sm font-medium capitalize',
                    cleared ? 'text-red-700 line-through' : 'text-neutral-800',
                  )}
                >
                  {item.ingredientName}
                </span>
                <span className="block text-xs text-neutral-500">
                  {item.quantity != null ? `${item.quantity} ${item.unit}` : 'some left'}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}

/**
 * Auto-opening wrapper for the shopping list page: opens at most once per
 * week (the week's first visit — Sundays included) for `pantryPlanning`
 * accounts that actually track items. Closing without confirming still
 * counts as "seen this week" — the sheet must never nag (§6.5 taste rules).
 */
export function PantryWeeklyConfirmAuto() {
  const { enabled } = useEntitlement('pantryPlanning');
  const { data } = trpc.pantry.list.useQuery(undefined, { enabled, staleTime: 60_000 });
  const [confirmedWeek, setConfirmedWeek] = useLocalStorage<string>('pantry-confirmed-week', '');
  const [open, setOpen] = useState(false);

  const weekKey = currentWeekKey();
  const due = enabled && (data?.count ?? 0) > 0 && confirmedWeek !== weekKey;

  useEffect(() => {
    if (due) setOpen(true);
  }, [due]);

  if (!due && !open) return null;
  return (
    <PantryConfirmSheet
      open={open}
      onClose={() => {
        setConfirmedWeek(weekKey);
        setOpen(false);
      }}
    />
  );
}
