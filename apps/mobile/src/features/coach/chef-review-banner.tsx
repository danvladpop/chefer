import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AI_REVIEW_A11Y_LABEL } from '@chefer/types';
import { Card, ExplainSheet, Text } from '@chefer/ui-mobile';
import { formatKcal, formatWeightTrend } from '@chefer/utils';
import { AiGeneratedChip } from '../../components/ai-generated-chip';
import { useUnitSystem } from '../../hooks/use-unit-system';
import { trpc } from '../../lib/trpc';
import { useNumbersMode } from '../numbers-mode/numbers-mode';
import { proteinAverageText, withoutKcalLines } from '../numbers-mode/numbers-mode-copy';
import { useProteinWeekAverage } from '../numbers-mode/use-protein-average';
import { openPremium } from '../premium/open-premium';

// Port of web features/coach/ChefReviewBanner (wave-2b). Renders nothing
// until a fresh review exists. Free = blurred-style teaser (placeholder
// copy, never the real review); premium = summary + inline expandable full
// text (web uses a Sheet).

const TEASER_PLACEHOLDER =
  'The rest of the review covers your protein pattern, the two dinners worth repeating, and one change for next week.';

type Review = {
  adherencePct: number;
  avgDailyKcal: number;
  adjustmentKcal: number;
};

/** T-11.6: days with a log out of the 7 the review looked at. */
function loggedDaysOf7(r: Review): number {
  return Math.round((r.adherencePct / 100) * 7);
}

function reviewExplainSentence(r: Review): string {
  const days = loggedDaysOf7(r);
  const base = `Your chef looked at the last 7 days: you logged ${days} of them, averaging ${formatKcal(r.avgDailyKcal)} kcal on those days.`;
  if (r.adjustmentKcal === 0) return base;
  const sign = r.adjustmentKcal > 0 ? '+' : '';
  return `${base} Your daily budget moved by ${sign}${r.adjustmentKcal} kcal, one small step per review and only when at least half your days were logged.`;
}

function reviewExplainRows(r: Review, trend: string | null): { label: string; value: string }[] {
  const rows = [
    { label: 'Days logged', value: `${loggedDaysOf7(r)} of 7 (${r.adherencePct} %)` },
    { label: 'Average on logged days', value: `${formatKcal(r.avgDailyKcal)} kcal` },
  ];
  if (trend) rows.push({ label: 'Weight trend', value: trend });
  if (r.adjustmentKcal !== 0) {
    rows.push({
      label: 'Daily budget change',
      value: `${r.adjustmentKcal > 0 ? '+' : ''}${r.adjustmentKcal} kcal`,
    });
  }
  return rows;
}

/** WP-08: the protein-only explanation — days logged and the protein average, no calories. */
function proteinExplainRows(
  r: Review,
  avg: { protein: number } | null,
  trend: string | null,
): { label: string; value: string }[] {
  const rows = [{ label: 'Days logged', value: `${loggedDaysOf7(r)} of 7 (${r.adherencePct} %)` }];
  if (avg) rows.push({ label: 'Average protein', value: `${Math.round(avg.protein)} g a day` });
  if (trend) rows.push({ label: 'Weight trend', value: trend });
  return rows;
}

/**
 * The weekly review card. In protein-only mode it reads the week's protein
 * average (WP-08) from the tracker's week summary — a query only this branch
 * makes, so full-mode screens never pay for it.
 */
export function ChefReviewBanner() {
  const { proteinOnly } = useNumbersMode();
  return proteinOnly ? <ProteinReviewBanner /> : <ReviewBanner proteinAverage={null} />;
}

function ProteinReviewBanner() {
  return <ReviewBanner proteinAverage={useProteinWeekAverage(true)} />;
}

function ReviewBanner({ proteinAverage }: { proteinAverage: { protein: number } | null }) {
  const { proteinOnly } = useNumbersMode();
  const { data } = trpc.coach.currentReview.useQuery(undefined, { staleTime: 60_000 });
  const system = useUnitSystem();
  const [expanded, setExpanded] = useState(false);
  const [explainOpen, setExplainOpen] = useState(false);
  // Mounted on first open and kept, so the sheet still plays its exit motion.
  const [explainMounted, setExplainMounted] = useState(false);

  if (!data || data.status === 'none') {
    return null;
  }

  if (data.status === 'teaser') {
    return (
      <Card testID="coach-teaser" className="border-amber-200 bg-amber-50">
        <View className="flex-row items-start gap-3">
          <Ionicons name="restaurant-outline" size={18} color="#944a00" />
          <View className="min-w-0 flex-1">
            <Text className="text-sm font-semibold text-gray-900">
              Your chef noticed something about your week…
            </Text>
            {(proteinOnly ? withoutKcalLines(data.firstLine) : data.firstLine) !== '' && (
              <Text className="mt-1 text-sm text-gray-700">
                {proteinOnly ? withoutKcalLines(data.firstLine) : data.firstLine}
              </Text>
            )}
            {/* Locked lines — placeholder text, deliberately NOT the review. */}
            <Text className="mt-1 text-sm text-gray-400 opacity-50">{TEASER_PLACEHOLDER}</Text>
            <Text className="mt-2 text-xs text-gray-500">
              The full review and auto-adjusting targets are part of Premium.
            </Text>
            <Pressable
              testID="coach-teaser-upgrade"
              accessibilityRole="button"
              onPress={() => openPremium('coach-review')}
              className="min-h-11 justify-center"
            >
              <Text className="text-xs font-semibold text-primary">See what Premium adds</Text>
            </Pressable>
          </View>
        </View>
      </Card>
    );
  }

  const r = data.review;
  const trend = formatWeightTrend(r.weightTrendKg, system);
  // WP-08: the review's text is composed server-side with calorie figures; protein-only drops those lines.
  const fullText = proteinOnly ? withoutKcalLines(r.reviewText) : r.reviewText;
  const reviewText = expanded ? fullText : fullText.split('\n')[0];

  return (
    <Card testID="coach-review" className="border-emerald-200 bg-emerald-50">
      <View className="flex-row items-start gap-3">
        <Ionicons name="restaurant-outline" size={18} color="#059669" />
        <View className="min-w-0 flex-1">
          <Text className="text-sm font-semibold text-emerald-900">
            Your chef&apos;s weekly review
          </Text>
          {/* R-14 (Art. 50): only when the model wrote the text, not the template. */}
          <AiGeneratedChip
            recipe={r}
            testID="coach-review-ai-chip"
            a11yLabel={AI_REVIEW_A11Y_LABEL}
          />
          <Text className="mt-0.5 text-xs text-emerald-800">{reviewText}</Text>
          <View className="mt-2 flex-row flex-wrap gap-x-4 gap-y-1">
            <Text className="text-xs text-emerald-800">
              <Text className="text-xs font-bold text-emerald-800">{r.adherencePct}%</Text> logged
            </Text>
            {proteinOnly ? (
              proteinAverage && (
                <Text testID="coach-review-protein-average" className="text-xs text-emerald-800">
                  {proteinAverageText(proteinAverage)}
                </Text>
              )
            ) : (
              <Text className="text-xs text-emerald-800">
                <Text className="text-xs font-bold text-emerald-800">{r.avgDailyKcal}</Text>{' '}
                kcal/day avg
              </Text>
            )}
            {trend && <Text className="text-xs text-emerald-800">{trend}</Text>}
            {!proteinOnly && r.adjustmentKcal !== 0 && (
              <Text className="text-xs text-emerald-800">
                budget {r.adjustmentKcal > 0 ? '+' : ''}
                {r.adjustmentKcal} kcal
              </Text>
            )}
          </View>
          <View className="flex-row flex-wrap items-center gap-x-4">
            <Pressable
              testID="coach-review-why"
              accessibilityRole="button"
              accessibilityLabel="Why these numbers"
              onPress={() => {
                setExplainMounted(true);
                setExplainOpen(true);
              }}
              className="mt-1 min-h-11 justify-center"
            >
              <Text className="text-sm font-semibold text-emerald-700">Why?</Text>
            </Pressable>
            <Pressable
              testID="coach-review-toggle"
              accessibilityRole="button"
              onPress={() => setExpanded((e) => !e)}
              className="mt-1 min-h-11 justify-center"
            >
              <Text className="text-sm font-semibold text-emerald-700">
                {expanded ? 'Show less' : 'See full review →'}
              </Text>
            </Pressable>
          </View>
          {explainMounted && (
            <ExplainSheet
              visible={explainOpen}
              onClose={() => setExplainOpen(false)}
              eyebrow="Your weekly review"
              title="Where these numbers come from"
              sentence={
                proteinOnly
                  ? `Your chef looked at the last 7 days: you logged ${loggedDaysOf7(r)} of them.`
                  : reviewExplainSentence(r)
              }
              rows={
                proteinOnly
                  ? proteinExplainRows(r, proteinAverage, trend)
                  : reviewExplainRows(r, trend)
              }
              footnote="Averages only count the days you logged."
              testID="coach-review-explain"
            />
          )}
        </View>
      </View>
    </Card>
  );
}
