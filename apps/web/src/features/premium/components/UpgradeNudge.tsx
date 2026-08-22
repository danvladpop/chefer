'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useNudge } from '@/features/premium/lib/nudge-cap';
import { capture } from '@/lib/analytics';
import { Sparkles, X } from 'lucide-react';
import { cn } from '@chefer/utils';

// ─── Moment-based upgrade nudge (premium_plan.md §6.5) ────────────────────────
// The ONLY way to render a contextual nudge. The frequency cap (one nudge per
// day, 7-day dismissal cooldown per source) is enforced by useNudge — callers
// just gate MOUNTING on their trigger moment (a rating saved, a stale Monday)
// and free tier. No urgency patterns, always dismissible.
//
// Analytics: mounting counts as an impression → `upgrade_prompt_shown
// { source }` (the §6.4 convention), so the funnel's per-source breakdown
// shows impression→click for every nudge. The CTA deep-links to /premium
// preserving the source.

export function UpgradeNudge({
  source,
  message,
  className,
}: {
  source: string;
  message: string;
  className?: string;
}) {
  const { visible, dismiss } = useNudge(source);

  useEffect(() => {
    if (visible) capture('upgrade_prompt_shown', { source });
  }, [visible, source]);

  if (!visible) return null;

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 py-1.5 pl-4 pr-1',
        className,
      )}
    >
      <Sparkles className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
      <p className="min-w-0 flex-1 py-1.5 text-sm text-neutral-700">
        {message}{' '}
        <Link
          href={`/premium?source=${encodeURIComponent(source)}`}
          className="whitespace-nowrap font-semibold text-[#944a00] underline-offset-2 hover:underline"
        >
          See premium →
        </Link>
      </p>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-neutral-400 hover:text-neutral-600"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
