import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, Text } from '@chefer/ui-mobile';
import { trpc } from '../../lib/trpc';

// Port of web features/coach/ChefReviewBanner (wave-2b). Renders nothing
// until a fresh review exists. Free = blurred-style teaser (placeholder
// copy, never the real review); premium = summary + inline expandable full
// text (web uses a Sheet).

const TEASER_PLACEHOLDER =
  'The rest of the review covers your protein pattern, the two dinners worth repeating, and one change for next week.';

function formatTrend(trendKg: number | null): string | null {
  if (trendKg === null) {
    return null;
  }
  const abs = Math.abs(trendKg).toFixed(1);
  if (Math.abs(trendKg) < 0.05) {
    return 'steady';
  }
  return `${trendKg < 0 ? '−' : '+'}${abs} kg/wk`;
}

export function ChefReviewBanner() {
  const { data } = trpc.coach.currentReview.useQuery(undefined, { staleTime: 60_000 });
  const [expanded, setExpanded] = useState(false);

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
            <Text className="mt-1 text-sm text-gray-700">{data.firstLine}</Text>
            {/* Locked lines — placeholder text, deliberately NOT the review. */}
            <Text className="mt-1 text-sm text-gray-400 opacity-50">{TEASER_PLACEHOLDER}</Text>
            <Text className="mt-2 text-xs text-gray-500">
              🔒 Full review + auto-adjusting targets are premium — upgrade from your Profile.
            </Text>
          </View>
        </View>
      </Card>
    );
  }

  const r = data.review;
  const trend = formatTrend(r.weightTrendKg);

  return (
    <Card testID="coach-review" className="border-emerald-200 bg-emerald-50">
      <View className="flex-row items-start gap-3">
        <Ionicons name="restaurant-outline" size={18} color="#059669" />
        <View className="min-w-0 flex-1">
          <Text className="text-sm font-semibold text-emerald-900">
            Your chef&apos;s weekly review
          </Text>
          <Text className="mt-0.5 text-xs text-emerald-800">
            {expanded ? r.reviewText : r.reviewText.split('\n')[0]}
          </Text>
          <View className="mt-2 flex-row flex-wrap gap-x-4 gap-y-1">
            <Text className="text-xs text-emerald-800">
              <Text className="text-xs font-bold text-emerald-800">{r.adherencePct}%</Text> logged
            </Text>
            <Text className="text-xs text-emerald-800">
              <Text className="text-xs font-bold text-emerald-800">{r.avgDailyKcal}</Text> kcal/day
              avg
            </Text>
            {trend && <Text className="text-xs text-emerald-800">{trend}</Text>}
            {r.adjustmentKcal !== 0 && (
              <Text className="text-xs text-emerald-800">
                budget {r.adjustmentKcal > 0 ? '+' : ''}
                {r.adjustmentKcal} kcal
              </Text>
            )}
          </View>
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
      </View>
    </Card>
  );
}
