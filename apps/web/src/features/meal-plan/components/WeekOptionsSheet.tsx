'use client';

import type { ReactNode } from 'react';
import { Loader2, RefreshCw, Wand2 } from 'lucide-react';
import { pressControl, Sheet } from '@chefer/ui';
import { cn, PLAN_WEEK_COPY } from '@chefer/utils';
import type { RebalanceCheckState } from '../hooks/use-rebalance-check';

// ─── "Week options" (FB7-11) ──────────────────────────────────────────────────
// ONE sheet replaces the separate Regenerate and "Rebalance my week" buttons.
// Two described rows: a new plan for the week (keeps the pins; always asks first
// — the existing confirm) and the free week rebalance, which is disabled — with
// the reason — when the preview found nothing to swap, and absent for a week
// that cannot be rebalanced (next week).

export function WeekOptionsSheet({
  open,
  onClose,
  onRegenerate,
  regenerating,
  rebalance,
}: {
  open: boolean;
  onClose: () => void;
  /** Opens the existing Regenerate confirm (this sheet closes first). */
  onRegenerate: () => void;
  regenerating: boolean;
  /** Absent for a week that cannot be rebalanced. */
  rebalance?: { state: RebalanceCheckState; onPress: () => void } | undefined;
}) {
  const state = rebalance?.state;
  const onTrack = state === 'on-track';
  const rebalanceDescription = onTrack
    ? PLAN_WEEK_COPY.rebalance.onTrack
    : state === 'error'
      ? PLAN_WEEK_COPY.rebalance.error
      : state === 'loading'
        ? PLAN_WEEK_COPY.rebalance.checking
        : PLAN_WEEK_COPY.rebalance.description;

  return (
    <Sheet open={open} onClose={onClose} title={PLAN_WEEK_COPY.optionsTitle} size="sm">
      <div className="flex min-w-0 flex-col gap-2 px-5 pb-5" data-testid="plan-week-options-sheet">
        <OptionRow
          testId="plan-week-options-regenerate"
          icon={<RefreshCw className="h-5 w-5" aria-hidden="true" />}
          title={PLAN_WEEK_COPY.regenerate.title}
          description={PLAN_WEEK_COPY.regenerate.description}
          disabled={regenerating}
          busy={regenerating}
          onClick={() => {
            onClose();
            onRegenerate();
          }}
        />
        {rebalance && (
          <OptionRow
            testId="plan-week-options-rebalance"
            icon={<Wand2 className="h-5 w-5" aria-hidden="true" />}
            title={PLAN_WEEK_COPY.rebalance.title}
            description={rebalanceDescription}
            disabled={onTrack || state === 'loading'}
            busy={state === 'loading'}
            onClick={() => {
              onClose();
              rebalance.onPress();
            }}
          />
        )}
      </div>
    </Sheet>
  );
}

function OptionRow({
  testId,
  icon,
  title,
  description,
  disabled,
  busy,
  onClick,
}: {
  testId: string;
  icon: ReactNode;
  title: string;
  description: string;
  disabled: boolean;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      disabled={disabled}
      aria-busy={busy}
      onClick={onClick}
      className={cn(
        'flex min-h-16 w-full items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-3 text-left text-[#944a00] hover:bg-gray-50',
        pressControl,
        disabled && 'opacity-60',
      )}
    >
      {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : icon}
      <span className="min-w-0 flex-1">
        <span className="block text-base font-medium text-gray-900">{title}</span>
        <span data-testid={`${testId}-description`} className="block text-sm text-gray-600">
          {description}
        </span>
      </span>
    </button>
  );
}
