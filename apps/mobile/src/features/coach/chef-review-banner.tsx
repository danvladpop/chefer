import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Translator } from '@chefer/i18n';
import { Card, ExplainSheet, Text, useThemeColors } from '@chefer/ui-mobile';
import { withoutKcalLines } from '@chefer/utils';
import { AiGeneratedChip } from '../../components/ai-generated-chip';
import { useUnitSystem } from '../../hooks/use-unit-system';
import { useT } from '../../lib/i18n';
import { rich } from '../../lib/i18n/rich';
import { trpc } from '../../lib/trpc';
import { useNumbersMode } from '../numbers-mode/numbers-mode';
import { useProteinWeekAverage } from '../numbers-mode/use-protein-average';
import { openPremium } from '../premium/open-premium';
import { weightTrendText } from './coach-copy';
import { CoachWhy } from './coach-why';

// Port of web features/coach/ChefReviewBanner (wave-2b). Renders nothing
// until a fresh review exists. Free = blurred-style teaser (placeholder
// copy, never the real review); premium = summary + inline expandable full
// text (web uses a Sheet).

type Review = {
  adherencePct: number;
  avgDailyKcal: number;
  adjustmentKcal: number;
};

/** T-11.6: days with a log out of the 7 the review looked at. */
function loggedDaysOf7(r: Review): number {
  return Math.round((r.adherencePct / 100) * 7);
}

function signedKcal(tr: Translator, kcal: number): string {
  return `${kcal > 0 ? '+' : ''}${tr.number(kcal)}`;
}

function reviewExplainSentence(tr: Translator, r: Review): string {
  const days = loggedDaysOf7(r);
  const avg = tr.number(Math.round(r.avgDailyKcal));
  if (r.adjustmentKcal === 0) {
    return tr.t('today.progress.review.explainSentence.kcal', { days, avg });
  }
  return tr.t('today.progress.review.explainSentenceBudget.kcal', {
    days,
    avg,
    change: signedKcal(tr, r.adjustmentKcal),
  });
}

function daysLoggedRow(tr: Translator, r: Review): { label: string; value: string } {
  return {
    label: tr.t('today.progress.review.rowDaysLogged'),
    value: tr.t('today.progress.review.rowDaysLoggedValue', {
      days: loggedDaysOf7(r),
      pct: r.adherencePct,
    }),
  };
}

function reviewExplainRows(
  tr: Translator,
  r: Review,
  trend: string | null,
): { label: string; value: string }[] {
  const { t } = tr;
  const rows = [
    daysLoggedRow(tr, r),
    {
      label: t('today.progress.review.rowAverage'),
      value: t('today.progress.review.rowAverageValue.kcal', {
        value: tr.number(Math.round(r.avgDailyKcal)),
      }),
    },
  ];
  if (trend) rows.push({ label: t('today.progress.review.rowWeightTrend'), value: trend });
  if (r.adjustmentKcal !== 0) {
    rows.push({
      label: t('today.progress.review.rowBudgetChange'),
      value: t('today.progress.review.rowBudgetChangeValue.kcal', {
        value: signedKcal(tr, r.adjustmentKcal),
      }),
    });
  }
  return rows;
}

/** WP-08: the protein-only explanation — days logged and the protein average, no calories. */
function proteinExplainRows(
  tr: Translator,
  r: Review,
  avg: { protein: number } | null,
  trend: string | null,
): { label: string; value: string }[] {
  const { t } = tr;
  const rows = [daysLoggedRow(tr, r)];
  if (avg) {
    rows.push({
      label: t('today.progress.review.rowAverageProtein'),
      value: t('today.progress.review.rowAverageProteinValue', {
        value: tr.number(Math.round(avg.protein)),
      }),
    });
  }
  if (trend) rows.push({ label: t('today.progress.review.rowWeightTrend'), value: trend });
  return rows;
}

/**
 * The weekly review card. In protein-only mode it reads the week's protein
 * average (WP-08) from the tracker's week summary — a query only this branch
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
  const colors = useThemeColors();
  const { proteinOnly } = useNumbersMode();
  const { data } = trpc.coach.currentReview.useQuery(undefined, { staleTime: 60_000 });
  const system = useUnitSystem();
  const tr = useT();
  const { t } = tr;
  const [expanded, setExpanded] = useState(false);
  const [explainOpen, setExplainOpen] = useState(false);
  // Mounted on first open and kept, so the sheet still plays its exit motion.
  const [explainMounted, setExplainMounted] = useState(false);

  if (!data || data.status === 'none') {
    return null;
  }

  if (data.status === 'teaser') {
    return (
      <Card testID="coach-teaser" className="border-brand/30 bg-brand-tint">
        <View className="flex-row items-start gap-3">
          <Ionicons name="restaurant-outline" size={18} color={colors.brand} />
          <View className="min-w-0 flex-1">
            <Text className="text-sm font-semibold text-label">
              {t('today.progress.review.noticed')}
            </Text>
            {(proteinOnly ? withoutKcalLines(data.firstLine) : data.firstLine) !== '' && (
              <Text className="mt-1 text-sm text-label-secondary">
                {proteinOnly ? withoutKcalLines(data.firstLine) : data.firstLine}
              </Text>
            )}
            {/* Locked lines — placeholder text, deliberately NOT the review. */}
            <Text className="mt-1 text-sm text-label-tertiary opacity-50">
              {t('today.progress.review.teaserApp')}
            </Text>
            {/* Lane D2: the reasoning is free; the number stays premium. */}
            {data.explanation ? (
              <CoachWhy explanation={data.explanation} tier="free" proteinOnly={proteinOnly} />
            ) : null}
            <Text className="mt-2 text-xs text-label-tertiary">
              {t('today.progress.review.lockedApp')}
            </Text>
            <Pressable
              testID="coach-teaser-upgrade"
              accessibilityRole="button"
              onPress={() => openPremium('coach-review')}
              className="min-h-11 justify-center"
            >
              <Text className="text-xs font-semibold text-primary">
                {t('today.progress.review.seePremium')}
              </Text>
            </Pressable>
          </View>
        </View>
      </Card>
    );
  }

  const r = data.review;
  const trend = weightTrendText(tr, r.weightTrendKg, system);
  // WP-08: the review's text is composed server-side with calorie figures; protein-only drops those lines.
  const fullText = proteinOnly ? withoutKcalLines(r.reviewText) : r.reviewText;
  const reviewText = expanded ? fullText : fullText.split('\n')[0];

  return (
    <Card testID="coach-review" className="border-positive/30 bg-positive/10">
      <View className="flex-row items-start gap-3">
        <Ionicons name="restaurant-outline" size={18} color={colors.positive} />
        <View className="min-w-0 flex-1">
          <Text className="text-sm font-semibold text-label">
            {t('today.progress.review.title')}
          </Text>
          {/* R-14 (Art. 50): only when the model wrote the text, not the template. */}
          <AiGeneratedChip
            recipe={r}
            testID="coach-review-ai-chip"
            a11yLabel={t('today.progress.review.aiA11y')}
          />
          <Text className="mt-0.5 text-xs text-positive">{reviewText}</Text>
          <View className="mt-2 flex-row flex-wrap gap-x-4 gap-y-1">
            <Text className="text-xs text-positive">
              {rich(t, 'today.progress.review.logged', {
                value: (
                  <Text className="text-xs font-bold text-positive">{`${r.adherencePct}%`}</Text>
                ),
              })}
            </Text>
            {proteinOnly ? (
              proteinAverage && (
                <Text testID="coach-review-protein-average" className="text-xs text-positive">
                  {t('today.numbersMode.proteinAverage', {
                    value: tr.number(Math.round(proteinAverage.protein)),
                  })}
                </Text>
              )
            ) : (
              <Text className="text-xs text-positive">
                {rich(t, 'today.progress.review.avgPerDay.kcal', {
                  value: <Text className="text-xs font-bold text-positive">{r.avgDailyKcal}</Text>,
                })}
              </Text>
            )}
            {trend && <Text className="text-xs text-positive">{trend}</Text>}
            {!proteinOnly && r.adjustmentKcal !== 0 && (
              <Text className="text-xs text-positive">
                {t('today.progress.review.budget.kcal', {
                  value: signedKcal(tr, r.adjustmentKcal),
                })}
              </Text>
            )}
          </View>
          <View className="flex-row flex-wrap items-center gap-x-4">
            <Pressable
              testID="coach-review-why"
              accessibilityRole="button"
              accessibilityLabel={t('today.progress.review.whyA11y')}
              onPress={() => {
                setExplainMounted(true);
                setExplainOpen(true);
              }}
              className="mt-1 min-h-11 justify-center"
            >
              <Text className="text-sm font-semibold text-positive">
                {t('today.progress.review.why')}
              </Text>
            </Pressable>
            <Pressable
              testID="coach-review-toggle"
              accessibilityRole="button"
              onPress={() => setExpanded((e) => !e)}
              className="mt-1 min-h-11 justify-center"
            >
              <Text className="text-sm font-semibold text-positive">
                {expanded
                  ? t('today.progress.review.showLess')
                  : t('today.progress.review.seeFull')}
              </Text>
            </Pressable>
          </View>
          {r.explanation ? (
            <CoachWhy explanation={r.explanation} tier="premium" proteinOnly={proteinOnly} />
          ) : null}
          {explainMounted && (
            <ExplainSheet
              visible={explainOpen}
              onClose={() => setExplainOpen(false)}
              eyebrow={t('today.progress.review.explainEyebrow')}
              title={t('today.progress.review.explainTitle')}
              sentence={
                proteinOnly
                  ? t('today.progress.review.explainSentenceProtein', { days: loggedDaysOf7(r) })
                  : reviewExplainSentence(tr, r)
              }
              rows={
                proteinOnly
                  ? proteinExplainRows(tr, r, proteinAverage, trend)
                  : reviewExplainRows(tr, r, trend)
              }
              footnote={t('today.progress.review.footnote')}
              testID="coach-review-explain"
            />
          )}
        </View>
      </View>
    </Card>
  );
}
