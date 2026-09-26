'use client';

import { useEffect, useRef, useState } from 'react';
import { UpgradeButton } from '@/features/premium/components/UpgradeButton';
import { capture } from '@/lib/analytics';
import { trpc } from '@/lib/trpc';
import { ChefHat, Lock, TrendingDown, TrendingUp } from 'lucide-react';
import { Sheet } from '@chefer/ui';

// ─── Weekly chef review banner (F1, coach) ────────────────────────────────────
// The upgraded Monday banner: shows while the latest review is fresh (the API
// enforces the 14-day window and shapes the payload by tier).
//   - premium → summary chips + "see full review" Sheet (chef_review_viewed)
//   - free    → §6.4 ghost state: the review's REAL first line, rest blurred.
//     The locked lines are placeholder glyphs — the server never sends the
//     full text to free accounts. Fires upgrade_prompt_shown {source:
//     'coach-review'} as the impression and teaser_engaged {feature:'coach'}
//     on interaction.

const TEASER_PLACEHOLDER =
  'Your chef wrote a few more lines about your week — the trend, the pattern behind it, and what next week should change.';

function formatTrend(trendKg: number | null): string | null {
  if (trendKg == null) return null;
  const abs = Math.abs(trendKg).toFixed(1);
  if (Math.abs(trendKg) < 0.05) return 'steady';
  return `${trendKg < 0 ? '−' : '+'}${abs} kg/wk`;
}

export function ChefReviewBanner() {
  const { data } = trpc.coach.currentReview.useQuery(undefined, { staleTime: 60_000 });
  const [sheetOpen, setSheetOpen] = useState(false);

  // Ghost-state impression — once per mount, only when the teaser renders.
  const impressionFired = useRef(false);
  const isTeaser = data?.status === 'teaser';
  useEffect(() => {
    if (isTeaser && !impressionFired.current) {
      impressionFired.current = true;
      capture('upgrade_prompt_shown', { source: 'coach-review' });
    }
  }, [isTeaser]);

  const engagementFired = useRef(false);
  const fireTeaserEngaged = () => {
    if (engagementFired.current) return;
    engagementFired.current = true;
    capture('teaser_engaged', { feature: 'coach' });
  };

  if (!data || data.status === 'none') return null;

  // ── Free tier: blurred-review ghost state ──────────────────────────────────
  if (data.status === 'teaser') {
    return (
      // Any tap inside the teaser counts as engagement (capture phase so the
      // UpgradeButton's own click still runs).
      <div
        onClickCapture={fireTeaserEngaged}
        className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-4"
      >
        <div className="flex items-start gap-3">
          <ChefHat className="mt-0.5 h-5 w-5 shrink-0 text-[#944a00]" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-900">
              Your chef noticed something about your week…
            </p>
            <p className="mt-1 text-sm text-gray-700">{data.firstLine}</p>
            {/* Locked lines — placeholder text, deliberately NOT the review. */}
            <p aria-hidden="true" className="mt-1 select-none text-sm text-gray-500 blur-[5px]">
              {TEASER_PLACEHOLDER}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <UpgradeButton source="coach-review" />
              <span className="flex items-center gap-1 text-xs text-gray-500">
                <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                Full review + auto-adjusting targets are premium
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Premium: summary + full-review sheet ───────────────────────────────────
  const r = data.review;
  const trend = formatTrend(r.weightTrendKg);
  const TrendIcon = (r.weightTrendKg ?? 0) < -0.05 ? TrendingDown : TrendingUp;

  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
      <div className="flex items-start gap-3">
        <ChefHat className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-emerald-900">Your chef&apos;s weekly review</p>
          <p className="mt-0.5 text-xs text-emerald-800">{r.reviewText.split('\n')[0]}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-emerald-800">
            <span>
              <strong>{r.adherencePct}%</strong> logged
            </span>
            <span>
              <strong>{r.avgDailyKcal}</strong> kcal/day avg
            </span>
            {trend && (
              <span className="flex items-center gap-1">
                <TrendIcon className="h-3.5 w-3.5" aria-hidden="true" />
                {trend}
              </span>
            )}
            {r.adjustmentKcal !== 0 && (
              <span>
                budget{' '}
                <strong>
                  {r.adjustmentKcal > 0 ? '+' : ''}
                  {r.adjustmentKcal} kcal
                </strong>
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              capture('chef_review_viewed');
              setSheetOpen(true);
            }}
            className="mt-2 min-h-11 text-sm font-semibold text-emerald-700 underline-offset-2 hover:underline sm:min-h-0"
          >
            See full review →
          </button>
        </div>
      </div>

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Your chef's weekly review"
        description={`Week of ${new Date(r.weekStart).toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
        })}`}
        size="md"
      >
        <div className="px-5 pb-5">
          <div className="mb-4 grid grid-cols-3 gap-3">
            {[
              { label: 'Days logged', value: `${r.adherencePct}%` },
              { label: 'Avg intake', value: `${r.avgDailyKcal} kcal` },
              { label: 'Weight trend', value: trend ?? '—' },
            ].map((s) => (
              <div key={s.label} className="rounded-xl bg-gray-50 p-3 text-center">
                <p className="text-sm font-bold text-gray-800">{s.value}</p>
                <p className="mt-0.5 text-xs uppercase tracking-wide text-gray-500">{s.label}</p>
              </div>
            ))}
          </div>
          {r.adjustmentKcal !== 0 && (
            <p className="mb-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
              Your daily calorie budget changed by{' '}
              <strong>
                {r.adjustmentKcal > 0 ? '+' : ''}
                {r.adjustmentKcal} kcal
              </strong>{' '}
              — the dashboard, tracker and your next generated week all use the new number.
            </p>
          )}
          <div className="space-y-2 text-sm leading-relaxed text-gray-700">
            {r.reviewText
              .split('\n')
              .map((line, i) => line.trim().length > 0 && <p key={i}>{line}</p>)}
          </div>
        </div>
      </Sheet>
    </div>
  );
}
