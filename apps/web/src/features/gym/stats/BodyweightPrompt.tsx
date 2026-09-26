'use client';

import { WeightLogForm } from '@/features/coach/components/WeightLogForm';
import { Scale } from 'lucide-react';

// Empty state for the bodyweight overlay / relative-strength toggle
// (gym_plan.md §1.3 Stats tab, §6.2): logs into the SAME WeightEntry log the
// nutrition side uses — no separate gym weight log.

export function BodyweightPrompt() {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-4">
      <Scale className="h-5 w-5 shrink-0 text-neutral-400" />
      <p className="min-w-0 flex-1 text-sm text-neutral-600">
        Log your weight to unlock the bodyweight overlay and relative-strength trend.
      </p>
      <div className="w-full sm:w-64">
        <WeightLogForm placeholder="72.5 kg" label="Weight in kilograms" />
      </div>
    </div>
  );
}
