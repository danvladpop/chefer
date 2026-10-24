import { View } from 'react-native';
import type { AchievementItem } from '@chefer/types';
import { PressableScale, Text } from '@chefer/ui-mobile';
import { cn, PROGRESS_COPY, tierNumeral } from '@chefer/utils';

// One badge on the shelf (mockup 06): an icon tile with the tier numeral in a
// small badge at its corner; grey until the first tier is earned; a dot while
// it is new. The whole tile is the 44pt+ button that opens its detail sheet.

export function achievementLabel(item: AchievementItem): string {
  const tier = item.tier > 0 ? ` ${tierNumeral(item.tier)}` : '';
  const state =
    item.tier === 0
      ? `, ${PROGRESS_COPY.achievementsLocked}`
      : item.isNew
        ? `, ${PROGRESS_COPY.achievementsNew}`
        : '';
  return `${item.title}${tier}${state}`;
}

export function AchievementTile({
  item,
  onPress,
}: {
  item: AchievementItem;
  onPress: (item: AchievementItem) => void;
}) {
  const earned = item.tier > 0;
  return (
    <PressableScale
      testID={`achievement-${item.id}`}
      accessibilityRole="button"
      accessibilityLabel={achievementLabel(item)}
      onPress={() => onPress(item)}
      className="w-1/4 items-center gap-1 px-1 py-2"
    >
      <View
        className={cn(
          'h-16 w-16 items-center justify-center rounded-card',
          earned ? 'border border-brand bg-brand-tint' : 'bg-surface-sunken opacity-50',
        )}
      >
        <Text accessibilityElementsHidden className="text-title1">
          {earned ? item.icon : '?'}
        </Text>
        {earned ? (
          <View
            testID={`achievement-${item.id}-tier`}
            className="absolute -bottom-1 -right-1 h-6 min-w-6 items-center justify-center rounded-full border border-separator bg-surface px-1"
          >
            <Text maxFontSizeMultiplier={1.2} className="text-caption font-bold text-brand">
              {tierNumeral(item.tier)}
            </Text>
          </View>
        ) : null}
        {item.isNew ? (
          <View
            testID={`achievement-${item.id}-new`}
            className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-attention"
          />
        ) : null}
      </View>
      <Text
        numberOfLines={2}
        maxFontSizeMultiplier={1.3}
        className={cn(
          'text-center text-caption',
          earned ? 'font-semibold text-label' : 'text-label-secondary',
        )}
      >
        {item.title}
      </Text>
    </PressableScale>
  );
}
