'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Plus } from 'lucide-react';
import { Sheet } from '@chefer/ui';
import { handleRebalanceResult } from '../lib/rebalance-storage';

// ─── Manual quick-add (F4, FREE tier included) ────────────────────────────────
// Name + kcal only — the honesty gap-filler: "I ate something off-plan" should
// never cost a subscription. Entries land as custom rows (estimatedBy:
// 'manual') alongside photo scans.

interface QuickAddSheetProps {
  /** YYYY-MM-DD day the entry is logged to. */
  date: string;
  onLogged: () => void;
}

export function QuickAddSheet({ date, onLogged }: QuickAddSheetProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [kcal, setKcal] = useState('');

  const logMutation = trpc.tracker.logCustomMeal.useMutation({
    onSuccess: (data) => {
      handleRebalanceResult(data.rebalance);
      setOpen(false);
      setName('');
      setKcal('');
      onLogged();
    },
  });

  const kcalNumber = Math.max(0, Math.min(5000, Math.round(Number(kcal) || 0)));
  const canSave = name.trim().length > 0 && kcalNumber > 0 && !logMutation.isPending;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-2xl border border-neutral-200 bg-white px-3 text-sm font-semibold text-neutral-700 shadow-sm transition hover:bg-neutral-50"
      >
        <Plus className="h-4 w-4" />
        Quick add
      </button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Quick add"
        description="Ate something off-plan? Log it honestly — name and calories are enough."
        size="sm"
        footer={
          <button
            type="button"
            onClick={() =>
              logMutation.mutate({
                date,
                name: name.trim(),
                estimatedBy: 'manual',
                mealType: 'snack',
                kcal: kcalNumber,
              })
            }
            disabled={!canSave}
            className="min-h-11 w-full rounded-xl bg-[#944a00] px-4 text-sm font-semibold text-white transition hover:bg-[#7a3d00] disabled:opacity-50"
          >
            {logMutation.isPending ? 'Logging…' : 'Log it'}
          </button>
        }
      >
        <div className="space-y-4 px-5 pb-4">
          <label className="flex flex-col gap-1 text-xs font-medium text-neutral-600">
            What did you eat?
            <input
              type="text"
              value={name}
              maxLength={200}
              placeholder="e.g. Slice of birthday cake"
              onChange={(e) => setName(e.target.value)}
              className="min-h-11 w-full rounded-xl border border-neutral-200 px-3 text-sm text-neutral-900"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-neutral-600">
            Roughly how many calories?
            <span className="flex items-center gap-1">
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={5000}
                value={kcal}
                placeholder="350"
                onChange={(e) => setKcal(e.target.value)}
                className="min-h-11 w-full min-w-0 rounded-xl border border-neutral-200 px-3 text-sm text-neutral-900"
              />
              <span className="shrink-0 text-neutral-400">kcal</span>
            </span>
          </label>
          {logMutation.isError && (
            <p className="text-xs text-red-600">{logMutation.error.message}</p>
          )}
        </div>
      </Sheet>
    </>
  );
}
