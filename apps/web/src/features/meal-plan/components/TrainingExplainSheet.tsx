'use client';

import Link from 'next/link';
import type { PlanTrainingBasis, PlanTrainingDay } from '@chefer/types';
import { Sheet } from '@chefer/ui';
import { trainingExplainCopy } from '@chefer/utils';

// ─── TrainingExplainSheet (UX-06, T-06.8) ──────────────────────────────────────
// The `Why?` sheet behind Today's training-day note and the plan's
// training-day header. Same sentences as mobile (trainingExplainCopy in
// @chefer/utils); the action links to the gym settings where the training days
// are chosen — never an upsell.

export interface TrainingExplainSheetProps {
  open: boolean;
  onClose: () => void;
  days: readonly PlanTrainingDay[];
  basis: PlanTrainingBasis | null;
}

export function TrainingExplainSheet({ open, onClose, days, basis }: TrainingExplainSheetProps) {
  const copy = trainingExplainCopy({ days, basis });
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={copy.title}
      description={copy.eyebrow}
      size="sm"
      footer={
        <Link
          href="/gym/settings"
          onClick={onClose}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-neutral-300 text-sm font-medium hover:bg-neutral-50"
        >
          {copy.actionLabel}
        </Link>
      }
    >
      <div className="space-y-4 px-5 pb-5" data-testid="training-explain">
        {copy.sentence && <p className="text-base text-neutral-800">{copy.sentence}</p>}
        {copy.rows.length > 0 && (
          <dl className="space-y-1">
            {copy.rows.map((row) => (
              <div
                key={row.label}
                className="flex items-start justify-between gap-3 border-b border-neutral-100 py-2"
              >
                <dt className="min-w-0 text-sm text-neutral-500">{row.label}</dt>
                {row.value && (
                  <dd className="shrink-0 text-sm font-medium text-neutral-800">{row.value}</dd>
                )}
              </div>
            ))}
          </dl>
        )}
        <p className="text-xs text-neutral-500">{copy.footnote}</p>
      </div>
    </Sheet>
  );
}
