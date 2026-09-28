'use client';

import { CheckCircle2, ChefHat, Sparkles } from 'lucide-react';
import type { PlanTailoring } from '@chefer/types';
import { buttonVariants, ProgressBar } from '@chefer/ui';
import {
  cn,
  PLAN_TAILORING_COPY,
  shouldShowTailoringBanner,
  tailoringBannerText,
  tailoringProgress,
} from '@chefer/utils';

// ─── Live tailoring banner (premium "instant week") ───────────────────────────
// The week is usable the moment it appears; this calm banner says the chef is
// still tailoring it (determinate progress, MO-06 — the shared ProgressBar
// animates scaleX and honours reduced motion), confirms briefly when it is
// done, and is honest when it stopped early ("Tailored 4 of 7 days — the rest
// are from our recipe collection") with a one-tap "Tailor the rest". Copy and
// state rules are shared with mobile (@chefer/utils plan-tailoring).

export interface TailoringBannerProps {
  tailoring: PlanTailoring | null | undefined;
  /** The user watched this job run here — DONE is only confirmed then. */
  sawRunning: boolean;
  /** Re-queue the untailored days; omitted = no action (not allowed / not premium). */
  onResume?: (() => void) | undefined;
  resuming?: boolean;
  className?: string;
}

const TONE = {
  running: {
    box: 'border-[#944a00]/20 bg-[#fff8f0] text-[#5c2e00]',
    icon: ChefHat,
    iconCls: 'text-[#944a00]',
  },
  done: {
    box: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    icon: CheckCircle2,
    iconCls: 'text-emerald-600',
  },
  partial: {
    box: 'border-amber-200 bg-amber-50 text-amber-900',
    icon: Sparkles,
    iconCls: 'text-amber-500',
  },
  failed: {
    box: 'border-gray-200 bg-gray-50 text-gray-800',
    icon: Sparkles,
    iconCls: 'text-gray-500',
  },
} as const;

export function TailoringBanner({
  tailoring,
  sawRunning,
  onResume,
  resuming = false,
  className,
}: TailoringBannerProps) {
  const text = tailoringBannerText(tailoring);
  if (!text || !shouldShowTailoringBanner(tailoring, sawRunning)) return null;
  const tone = TONE[text.tone];
  const Icon = tone.icon;
  const { done, total, fraction } = tailoringProgress(tailoring);
  const action = text.actionLabel && onResume ? text.actionLabel : null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="plan-tailoring-banner"
      data-state={text.tone}
      className={cn(
        'flex flex-col gap-2 rounded-xl border px-4 py-3 animate-in fade-in-0 duration-base ease-enter',
        tone.box,
        className,
      )}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <p className="flex min-w-0 items-start gap-2 text-sm">
          <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', tone.iconCls)} aria-hidden="true" />
          <span className="min-w-0">
            <strong className="font-semibold">{text.title}</strong>
            {text.tone === 'running' ? (
              <span data-testid="plan-tailoring-count"> · {text.detail}</span>
            ) : (
              <span className="block text-xs opacity-90 sm:inline sm:text-sm">
                {/* Inline on wide screens ("… 7 days — the rest …"); its own line on phones. */}
                <span className="hidden sm:inline">{text.tone === 'partial' ? ' — ' : ' '}</span>
                {text.detail}
              </span>
            )}
          </span>
        </p>
        {action && (
          <button
            type="button"
            data-testid="plan-tailoring-resume"
            onClick={onResume}
            disabled={resuming}
            className={cn(
              buttonVariants({ variant: 'outline', size: 'sm' }),
              'min-h-11 shrink-0 bg-white sm:min-h-9',
            )}
          >
            {resuming ? 'Asking your chef…' : action}
          </button>
        )}
      </div>
      {text.tone === 'running' && (
        <>
          <ProgressBar
            progress={fraction}
            label={`${done} of ${total} days tailored`}
            className="h-1.5 bg-[#944a00]/10"
            data-testid="plan-tailoring-progress"
          />
          <p className="text-xs opacity-80">{PLAN_TAILORING_COPY.runningHint}</p>
        </>
      )}
    </div>
  );
}
