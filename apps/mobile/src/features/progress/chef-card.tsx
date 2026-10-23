import { View } from 'react-native';
import { router } from 'expo-router';
import { PressableScale, ProgressBar, ProgressRing, Text, useThemeColors } from '@chefer/ui-mobile';
import {
  badgesOfTotal,
  chefCardFlameLabel,
  levelLabel,
  PROGRESS_COPY,
  xpToRankLine,
} from '@chefer/utils';
import { Icon } from '../../components/icon';
import { trpc } from '../../lib/trpc';
import { useProgressSummary } from './use-progress';

// ChefCard (mockup 09): the top of You — the level ring, the rank, the XP bar,
// the flame and how many badges are earned; one tap opens Achievements. Hidden
// when "Show XP & levels" is off (Achievements stay reachable from the list
// below). Showcase and Kitchen crew are P2. MO-06 ring and bar.

export function ChefCard() {
  const colors = useThemeColors();
  const { enabled, summary } = useProgressSummary();
  const achievements = trpc.progress.achievements.useQuery(undefined, {
    enabled: enabled && summary?.settings.showXp === true,
    staleTime: 60_000,
  });
  if (!summary?.settings.showXp) return null;
  const { xp, rank, nextRank, flame } = summary;
  const progress = xp.xpForLevel > 0 ? xp.xpIntoLevel / xp.xpForLevel : 0;
  const badges = achievements.data
    ? badgesOfTotal(achievements.data.earned, achievements.data.total)
    : null;

  return (
    <PressableScale
      testID="chef-card"
      pressScale="card"
      accessibilityRole="button"
      accessibilityLabel={`${rank.title}, ${levelLabel(xp.level)}. ${xpToRankLine(xp.xpIntoLevel, xp.xpForLevel, xp.level, nextRank)}.${flame.current > 0 ? ` ${chefCardFlameLabel(flame.current)}.` : ''}${badges ? ` ${PROGRESS_COPY.achievementsTitle}: ${badges}.` : ''}`}
      accessibilityHint={PROGRESS_COPY.achievementsTitle}
      onPress={() => router.push('/achievements')}
      className="gap-3 rounded-card border border-separator bg-brand-tint p-4"
    >
      <View className="flex-row items-center gap-4">
        <ProgressRing
          testID="chef-card-ring"
          progress={progress}
          size={72}
          strokeWidth={6}
          color={colors.brand}
          trackColor={colors.surface}
        >
          <Text maxFontSizeMultiplier={1.2} className="text-title2 font-bold text-brand">
            {xp.level}
          </Text>
        </ProgressRing>
        <View className="min-w-0 flex-1 gap-1">
          <Text
            testID="chef-card-rank"
            numberOfLines={1}
            className="text-title3 font-bold text-label"
          >
            {rank.title}
            <Text className="text-callout font-semibold text-brand"> · {levelLabel(xp.level)}</Text>
          </Text>
          <Text className="text-subhead text-label-secondary">
            {xpToRankLine(xp.xpIntoLevel, xp.xpForLevel, xp.level, nextRank)}
          </Text>
          <ProgressBar
            testID="chef-card-bar"
            progress={progress}
            color={colors.attention}
            className="h-2 bg-surface"
          />
          {flame.current > 0 ? (
            <Text testID="chef-card-flame" className="text-subhead font-semibold text-attention">
              🔥 {chefCardFlameLabel(flame.current)}
            </Text>
          ) : null}
        </View>
      </View>
      <View className="min-h-11 flex-row items-center justify-between gap-3 border-t border-separator pt-3">
        <Text className="min-w-0 flex-1 text-callout font-semibold text-label">
          🏆 {PROGRESS_COPY.achievementsTitle}
        </Text>
        {badges ? (
          <Text testID="chef-card-badges" className="text-callout text-label-secondary">
            {badges}
          </Text>
        ) : null}
        <Icon name="chevronRight" color={colors.brand} size={18} />
      </View>
    </PressableScale>
  );
}
