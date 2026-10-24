'use client';

import Link from 'next/link';
import { trpc } from '@/lib/trpc';
import type { ProgressSummary } from '@chefer/types';
import { pressControl } from '@chefer/ui';
import { cn, PROGRESS_COPY } from '@chefer/utils';
import { PROGRESS_WEB_COPY } from './copy';
import { ProgressStrip } from './progress-strip';
import { TodaysThreeCard } from './todays-three-card';
import { useProgressSummary } from './use-progress';

// ─── Everything Kitchen progress puts on Today (lane D1) ──────────────────────
// One mount line in `/dashboard`: the one-time welcome card, the calm "quiet"
// card, the weekly-recap banner, the strip and Today's three. Renders nothing
// (and makes no `progress.*` call beyond the gate) while the flag is off.

function IntroCard({ summary }: { summary: ProgressSummary }) {
  const utils = trpc.useUtils();
  const markSeen = trpc.progress.markSeen.useMutation({
    meta: { silent: true },
    onSuccess: () => {
      void utils.progress.summary.invalidate();
    },
  });
  const { intro } = summary;
  if (!intro) return null;
  return (
    <section
      data-testid="progress-intro"
      aria-labelledby="progress-intro-title"
      className="rounded-card border border-[#944a00]/15 bg-[#fff3e8] p-4"
    >
      <h2 id="progress-intro-title" className="text-base font-bold text-gray-900">
        {PROGRESS_COPY.introTitle}
      </h2>
      <p className="mt-1 text-sm text-gray-700">{PROGRESS_COPY.introBody}</p>
      {summary.settings.showXp && (
        <p className="mt-1 text-sm font-semibold text-[#944a00]">
          {PROGRESS_WEB_COPY.introHistory(intro.backdatedXp, intro.badges)}
        </p>
      )}
      <button
        type="button"
        disabled={markSeen.isPending}
        onClick={() => markSeen.mutate({ intro: true })}
        className={cn(
          'mt-3 flex min-h-11 items-center justify-center rounded-control bg-[#944a00] px-5 text-sm font-semibold text-white hover:bg-[#7a3d00] disabled:opacity-60',
          pressControl,
        )}
      >
        {PROGRESS_COPY.introCta}
      </button>
    </section>
  );
}

function QuietCard() {
  return (
    <section
      data-testid="progress-quiet"
      aria-labelledby="progress-quiet-title"
      className="rounded-card border bg-white p-4"
    >
      <h2 id="progress-quiet-title" className="text-base font-bold text-gray-900">
        {PROGRESS_COPY.quietSupportTitle}
      </h2>
      <p className="mt-1 text-sm text-gray-700">{PROGRESS_COPY.quietSupportBody}</p>
    </section>
  );
}

function RecapBanner({ weekStart }: { weekStart: string }) {
  return (
    <Link
      href={`/kitchen-recap/${weekStart}`}
      data-testid="progress-recap-banner"
      className={cn(
        'flex min-h-11 min-w-0 items-center justify-between gap-3 rounded-card bg-gradient-to-r from-[#944a00] to-[#6b3200] px-4 py-3 text-white',
        pressControl,
      )}
    >
      <span className="min-w-0 text-sm font-semibold">{PROGRESS_COPY.recapBanner}</span>
      <span className="shrink-0 rounded-full bg-white/20 px-3 py-1 text-xs font-bold">
        {PROGRESS_COPY.recapBannerCta}
      </span>
    </Link>
  );
}

export function ProgressToday() {
  const { enabled, summary } = useProgressSummary();
  if (!enabled || !summary) return null;
  return (
    <div className="flex flex-col gap-4 empty:hidden" data-testid="progress-today">
      {summary.intro && <IntroCard summary={summary} />}
      {summary.quiet && <QuietCard />}
      {summary.recap && <RecapBanner weekStart={summary.recap.weekStart} />}
      <ProgressStrip summary={summary} />
      <TodaysThreeCard summary={summary} />
    </div>
  );
}
