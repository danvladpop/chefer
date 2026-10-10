import { Pressable, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import type { PlanTailoring } from '@chefer/types';
import { duration, ProgressBar, Text, useReducedMotion, useThemeColors } from '@chefer/ui-mobile';
import { shouldShowTailoringBanner, tailoringBannerText, tailoringProgress } from '@chefer/utils';

// The old Plan's live-tailoring banner (premium "instant week"), compact for
// the new Meals tab: one caption line and a thin determinate bar while the
// chef works (MO-06), the same copy and the same "Tailor the rest" action
// when it stopped early. MO-13: fades in, instantly under Reduce Motion.

export function TailoringLine({
  tailoring,
  sawRunning,
  onResume,
  resuming,
}: {
  tailoring: PlanTailoring | null | undefined;
  sawRunning: boolean;
  onResume?: (() => void) | undefined;
  resuming: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const colors = useThemeColors();
  const text = tailoringBannerText(tailoring);
  if (!text || !shouldShowTailoringBanner(tailoring, sawRunning)) return null;
  const { fraction } = tailoringProgress(tailoring);
  const action = text.actionLabel && onResume ? text.actionLabel : null;
  const line = `${text.title} · ${text.detail}`;

  return (
    <Animated.View
      entering={FadeIn.duration(reducedMotion ? 0 : duration.base)}
      testID="meals-tailoring"
      accessibilityRole="summary"
      accessibilityLiveRegion="polite"
      className="gap-1.5"
    >
      <View className="flex-row items-center gap-2">
        <Text
          testID="meals-tailoring-text"
          className={
            text.tone === 'done'
              ? 'min-w-0 flex-1 text-caption text-positive'
              : 'min-w-0 flex-1 text-caption text-label-secondary'
          }
        >
          {line}
        </Text>
        {action ? (
          <Pressable
            testID="meals-tailoring-resume"
            accessibilityRole="button"
            accessibilityState={{ busy: resuming, disabled: resuming }}
            disabled={resuming}
            onPress={onResume}
            className="min-h-11 justify-center px-1"
          >
            <Text className="text-subhead font-semibold text-brand">{action}</Text>
          </Pressable>
        ) : null}
      </View>
      {text.tone === 'running' ? (
        <ProgressBar
          progress={fraction}
          color={colors.brand}
          className="h-1 bg-surface-sunken"
          accessibilityLabel={line}
        />
      ) : null}
    </Animated.View>
  );
}
