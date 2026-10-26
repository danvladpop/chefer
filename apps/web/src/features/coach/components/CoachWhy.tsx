'use client';

import { useId, useState } from 'react';
import { useUnitSystem } from '@/hooks/useUnitSystem';
import { capture } from '@/lib/analytics';
import { ChevronDown } from 'lucide-react';
import type { CoachExplanation } from '@chefer/types';
import { cn, COACH_WHY_TITLE, coachExplanationText } from '@chefer/utils';

// ─── "Why this suggestion" (market review 2026-10, lane D2) ──────────────────
// The weekly review's deterministic explanation: a few plain sentences and
// the numbers behind them, in the user's units. Free and premium see the
// same reasoning; only premium sees the suggested number (the API withholds
// it). Collapsed by default so the review stays the headline. The chevron
// turn is MO-05 (fast, standard easing; reduced motion via globals.css).

export function CoachWhy({
  explanation,
  tier,
  proteinOnly = false,
  defaultOpen = false,
}: {
  explanation: CoachExplanation;
  tier: 'free' | 'premium';
  proteinOnly?: boolean;
  defaultOpen?: boolean;
}) {
  const system = useUnitSystem();
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  const { lines, data } = coachExplanationText(explanation, system, { proteinOnly });

  return (
    <div data-testid="coach-why" className="mt-3 rounded-xl bg-white/70 p-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          if (!open) capture('coach_why_viewed', { tier, reason: explanation.reason });
          setOpen((o) => !o);
        }}
        className="flex min-h-11 w-full items-center justify-between gap-2 text-left text-sm font-semibold text-gray-800"
      >
        {COACH_WHY_TITLE}
        <ChevronDown
          aria-hidden="true"
          className={cn(
            'h-4 w-4 shrink-0 transition-transform duration-fast ease-standard',
            open && 'rotate-180',
          )}
        />
      </button>
      {open && (
        <div id={panelId} data-testid="coach-why-panel" className="mt-1 space-y-2">
          {lines.map((line) => (
            <p key={line} className="text-sm leading-relaxed text-gray-700">
              {line}
            </p>
          ))}
          {data.length > 0 && (
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 border-t pt-2 text-xs">
              {data.map((row) => (
                <div key={row.label} className="contents">
                  <dt className="text-gray-500">{row.label}</dt>
                  <dd className="min-w-0 font-medium text-gray-800">{row.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      )}
    </div>
  );
}
