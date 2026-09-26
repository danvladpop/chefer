import { View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { cn } from '@chefer/utils';
import { isOverTarget, mainFill, normaliseProgress, progressColor } from '../motion/progress';
import { useProgressValue } from '../motion/use-progress-value';
import { colors } from './theme';

export interface ProgressBarProps {
  /** 0..1 of the target; above 1 the bar is full (and over-coloured with `overColor`). */
  progress: number;
  color?: string;
  /** Over-target colour (MO-06). Past 100% the fill switches to it and gains an end cap. */
  overColor?: string;
  /** End-cap colour past 100% (default: a darker amber). */
  capColor?: string;
  /** Track classes — height and background (default `h-2 bg-gray-100`). */
  className?: string;
  testID?: string;
  accessibilityLabel?: string;
}

/**
 * Horizontal progress bar (MO-06). The fill animates `scaleX` from the left —
 * never `width`, which is layout work — from the previous value (0 on first
 * mount) over `deliberate` 600 ms with the `enter` curve. Past 100% with an
 * `overColor`, the fill turns that colour and a small darker end cap marks
 * the overflow, so 81 g of a 62 g target no longer looks merely "full".
 */
export function ProgressBar({
  progress,
  color = colors.primary,
  overColor,
  capColor = colors.warningStrong,
  className,
  testID,
  accessibilityLabel,
}: ProgressBarProps) {
  const target = normaliseProgress(progress);
  const over = overColor !== undefined && isOverTarget(target);
  const animated = useProgressValue(target);
  const fillStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: mainFill(animated.get()) }],
  }));
  // The cap appears once the fill has actually crossed 100%.
  const capStyle = useAnimatedStyle(() => ({ opacity: isOverTarget(animated.get()) ? 1 : 0 }));

  return (
    <View
      testID={testID}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(mainFill(target) * 100) }}
      className={cn('h-2 w-full overflow-hidden rounded-full bg-gray-100', className)}
    >
      <Animated.View
        testID={testID ? `${testID}-fill` : undefined}
        style={[
          {
            height: '100%',
            width: '100%',
            borderRadius: 9999,
            transformOrigin: 'left',
            backgroundColor: progressColor(target, color, overColor),
          },
          fillStyle,
        ]}
      />
      {over ? (
        <Animated.View
          testID={testID ? `${testID}-cap` : undefined}
          style={[
            {
              position: 'absolute',
              right: 0,
              top: 0,
              bottom: 0,
              width: 4,
              borderRadius: 9999,
              backgroundColor: capColor,
            },
            capStyle,
          ]}
        />
      ) : null}
    </View>
  );
}
