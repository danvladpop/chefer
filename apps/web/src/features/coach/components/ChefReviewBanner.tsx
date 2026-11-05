'use client';

import { useEffect, useRef, useState } from 'react';
import { useNumbersMode } from '@/features/numbers-mode/numbers-mode';
import { useProteinWeekAverage } from '@/features/numbers-mode/use-protein-average';
import { UpgradeButton } from '@/features/premium/components/UpgradeButton';
import { AiGeneratedChip } from '@/features/privacy/components/AiGeneratedChip';
import { useUnitSystem } from '@/hooks/useUnitSystem';
import { capture } from '@/lib/analytics';
import { useT } from '@/lib/i18n';
import { rich } from '@/lib/i18n/rich';
import { trpc } from '@/lib/trpc';
import { ChefHat, Lock, TrendingDown, TrendingUp } from 'lucide-react';
import { Sheet } from '@chefer/ui';
import { withoutKcalLines } from '@chefer/utils';
import { weightTrendText } from '../coach-copy';
import { CoachWhy } from './CoachWhy';

// ─── Weekly chef review banner (F1, coach) ────────────────────────────────────
// The upgraded Monday banner: shows while the latest review is fresh (the API
// enforces the 14-day window and shapes the payload by tier).
//   - premium → summary chips + "see full review" Sheet (chef_review_viewed)
//   - free    → §6.4 ghost state: the review's REAL first line, rest blurred.
//     The locked lines are placeholder glyphs — the server never sends the
//     full text to free accounts. Fires upgrade_prompt_shown {source:
//     'coach-review'} as the impression and teaser_engaged {feature:'coach'}
//     on interaction.

/**
 * The weekly review card. In protein-only mode (WP-08) it reads the week's
 * protein average from the tracker's week summary — a query only that branch
 * makes, so full-mode screens never pay for it.
 */
export function ChefReviewBanner() {
  const { proteinOnly, noNumbers } = useNumbersMode();
  // Lane E3 "Hide numbers": the weekly review is calories, protein and weight — not shown.
  if (noNumbers) return null;
  return proteinOnly ? <ProteinReviewBanner /> : <ReviewBanner proteinAverage={null} />;
}

function ProteinReviewBanner() {
  return <ReviewBanner proteinAverage={useProteinWeekAverage(true)} />;
}

function ReviewBanner({ proteinAverage }: { proteinAverage: { protein: number } | null }) {
  const { proteinOnly } = useNumbersMode();
  const { data } = trpc.coach.currentReview.useQuery(undefined, { staleTime: 60_000 });
  const system = useUnitSystem();
  const tr = useT();
  const { t } = tr;
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
              {t('today.progress.review.noticed')}
            </p>
            {(proteinOnly ? withoutKcalLines(data.firstLine) : data.firstLine) !== '' && (
              <p className="mt-1 text-sm text-gray-700">
                {proteinOnly ? withoutKcalLines(data.firstLine) : data.firstLine}
              </p>
            )}
            {/* Locked lines — placeholder text, deliberately NOT the review. */}
            <p aria-hidden="true" className="mt-1 select-none text-sm text-gray-500 blur-[5px]">
              {t('today.progress.review.teaser')}
            </p>
            {/* Lane D2: the reasoning is free; the number stays premium. */}
            {data.explanation && (
              <CoachWhy explanation={data.explanation} tier="free" proteinOnly={proteinOnly} />
            )}
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <UpgradeButton source="coach-review" />
              <span className="flex items-center gap-1 text-xs text-gray-500">
                <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                {t('today.progress.review.locked')}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Premium: summary + full-review sheet ───────────────────────────────────
  const r = data.review;
  const trend = weightTrendText(tr, r.weightTrendKg, system);
  const signedKcal = (kcal: number) => `${kcal > 0 ? '+' : ''}${tr.number(kcal)}`;
  const TrendIcon = (r.weightTrendKg ?? 0) < -0.05 ? TrendingDown : TrendingUp;
  // WP-08: the review's text is composed server-side with calorie figures; protein-only drops those lines.
  const fullText = proteinOnly ? withoutKcalLines(r.reviewText) : r.reviewText;

  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
      <div className="flex items-start gap-3">
        <ChefHat className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-emerald-900">
            {t('today.progress.review.title')}
          </p>
          {/* R-14 (Art. 50): only when the model wrote the text, not the template. */}
          <AiGeneratedChip
            recipe={r}
            a11yLabel={t('today.progress.review.aiA11y')}
            testId="coach-review-ai-chip"
            className="mt-1"
          />
          <p className="mt-0.5 text-xs text-emerald-800">{fullText.split('\n')[0]}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-emerald-800">
            <span>
              {rich(t, 'today.progress.review.logged', {
                value: <strong>{`${r.adherencePct}%`}</strong>,
              })}
            </span>
            {proteinOnly ? (
              proteinAverage && (
                <span data-testid="coach-review-protein-average">
                  {t('today.numbersMode.proteinAverage', {
                    value: tr.number(Math.round(proteinAverage.protein)),
                  })}
                </span>
              )
            ) : (
              <span>
                {rich(t, 'today.progress.review.avgPerDay.kcal', {
                  value: <strong>{r.avgDailyKcal}</strong>,
                })}
              </span>
            )}
            {trend && (
              <span className="flex items-center gap-1">
                <TrendIcon className="h-3.5 w-3.5" aria-hidden="true" />
                {trend}
              </span>
            )}
            {!proteinOnly && r.adjustmentKcal !== 0 && (
              <span>
                {rich(t, 'today.progress.review.budget.kcal', {
                  value: <strong>{signedKcal(r.adjustmentKcal)}</strong>,
                })}
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
            {t('today.progress.review.seeFull')}
          </button>
        </div>
      </div>

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={t('today.progress.review.title')}
        description={t('today.progress.review.weekOf', {
          date: tr.date(new Date(r.weekStart), 'long'),
        })}
        size="md"
      >
        <div className="px-5 pb-5">
          <div className="mb-4 grid grid-cols-3 gap-3">
            {[
              { label: t('today.progress.review.statDaysLogged'), value: `${r.adherencePct}%` },
              proteinOnly
                ? {
                    label: t('today.progress.review.statAvgProtein'),
                    value: proteinAverage
                      ? t('today.progress.review.statProteinValue', {
                          value: tr.number(Math.round(proteinAverage.protein)),
                        })
                      : '—',
                  }
                : {
                    label: t('today.progress.review.statAvgIntake'),
                    value: t('today.progress.review.statIntake.kcal', { value: r.avgDailyKcal }),
                  },
              { label: t('today.progress.review.statWeightTrend'), value: trend ?? '—' },
            ].map((s) => (
              <div key={s.label} className="rounded-xl bg-gray-50 p-3 text-center">
                <p className="text-sm font-bold text-gray-800">{s.value}</p>
                <p className="mt-0.5 text-xs uppercase tracking-wide text-gray-500">{s.label}</p>
              </div>
            ))}
          </div>
          {!proteinOnly && r.adjustmentKcal !== 0 && (
            <p className="mb-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
              {rich(t, 'today.progress.review.budgetChanged.kcal', {
                value: <strong>{signedKcal(r.adjustmentKcal)}</strong>,
              })}
            </p>
          )}
          <div className="space-y-2 text-sm leading-relaxed text-gray-700">
            {fullText.split('\n').map((line, i) => line.trim().length > 0 && <p key={i}>{line}</p>)}
          </div>
          {r.explanation && (
            <CoachWhy explanation={r.explanation} tier="premium" proteinOnly={proteinOnly} />
          )}
        </div>
      </Sheet>
    </div>
  );
}
