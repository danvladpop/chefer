'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Scale } from 'lucide-react';

// Empty state for the bodyweight overlay / relative-strength toggle
// (gym_plan.md §1.3 Stats tab, §6.2): logs into the SAME WeightEntry log the
// nutrition side uses — no separate gym weight log.

export function BodyweightPrompt() {
  const [value, setValue] = useState('');
  const [saved, setSaved] = useState(false);
  const utils = trpc.useUtils();

  const logWeight = trpc.tracker.logWeight.useMutation({
    onSuccess: () => {
      setSaved(true);
      setValue('');
      setTimeout(() => setSaved(false), 3000);
      void utils.gym.stats.bodyweight.invalidate();
      void utils.gym.bootstrap.invalidate();
      void utils.tracker.weightHistory.invalidate();
    },
  });

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-4">
      <Scale className="h-5 w-5 shrink-0 text-neutral-400" />
      <p className="min-w-0 flex-1 text-sm text-neutral-600">
        Log your weight to unlock the bodyweight overlay and relative-strength trend.
      </p>
      <div className="flex shrink-0 gap-2">
        <input
          type="number"
          step="0.1"
          min="30"
          max="300"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="72.5 kg"
          inputMode="decimal"
          aria-label="Weight in kilograms"
          className="min-h-11 w-28 min-w-0 rounded-xl border border-neutral-200 px-3 text-sm focus:border-[#944a00] focus:outline-none focus:ring-1 focus:ring-[#944a00]"
        />
        <button
          type="button"
          onClick={() => {
            const kg = parseFloat(value);
            if (!isNaN(kg) && kg > 0) logWeight.mutate({ weightKg: kg });
          }}
          disabled={!value || logWeight.isPending || saved}
          className="min-h-11 shrink-0 rounded-xl bg-[#944a00] px-4 text-sm font-semibold text-white transition hover:bg-[#7a3d00] disabled:opacity-50"
        >
          {saved ? '✓ Saved' : 'Log'}
        </button>
      </div>
    </div>
  );
}
