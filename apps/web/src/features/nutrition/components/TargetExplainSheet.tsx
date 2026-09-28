'use client';

import Link from 'next/link';
import type { TargetsView } from '@chefer/types';
import { Sheet } from '@chefer/ui';
import {
  explainCarbsFatSentence,
  explainKcalSentence,
  explainProteinSentence,
} from '@chefer/utils';

// ─── TargetExplainSheet (§2.11, T-11.2) ─────────────────────────────────────────
// UX-11 AC3: tapping the ring, a macro, or the day totals opens this sheet.
// Web mirror of mobile's target-explain-sheet.tsx — same sentences
// (explain-targets.ts), same "never an upsell" action.

export interface TargetExplainSheetProps {
  open: boolean;
  onClose: () => void;
  /** `targets.get`'s resolved view — omitted while it's still loading. */
  view: TargetsView | undefined;
}

export function TargetExplainSheet({ open, onClose, view }: TargetExplainSheetProps) {
  const rows = view
    ? [
        { label: 'Calories', value: `${view.effective.dailyCalorieTarget.toLocaleString()} kcal` },
        { label: 'Protein', value: `${view.effective.proteinG} g` },
        { label: 'Carbs', value: `${view.effective.carbsG} g` },
        { label: 'Fat', value: `${view.effective.fatG} g` },
      ]
    : [];

  const sentence = view
    ? view.source === 'own'
      ? 'You set this target yourself.'
      : explainKcalSentence(view.inputs)
    : null;

  const footnote = view
    ? [explainProteinSentence(view.inputs), explainCarbsFatSentence()].join(' ')
    : null;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Why this number"
      description="Your target"
      size="sm"
      footer={
        <Link
          href="/preferences#targets"
          onClick={onClose}
          className="inline-flex h-10 w-full items-center justify-center rounded-md border border-neutral-300 text-sm font-medium hover:bg-neutral-50"
        >
          {view?.source === 'own' ? 'Use the suggested target' : 'Set your own target'}
        </Link>
      }
    >
      <div className="space-y-4">
        {sentence && <p className="text-base text-neutral-800">{sentence}</p>}
        {rows.length > 0 && (
          <div className="space-y-2">
            {rows.map((row) => (
              <div
                key={row.label}
                className="flex items-center justify-between border-b border-neutral-100 py-2"
              >
                <span className="text-sm text-neutral-500">{row.label}</span>
                <span className="text-sm font-medium text-neutral-800">{row.value}</span>
              </div>
            ))}
          </div>
        )}
        {footnote && <p className="text-xs text-neutral-500">{footnote}</p>}
      </div>
    </Sheet>
  );
}
