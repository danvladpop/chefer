import { View } from 'react-native';
import Animated, { useAnimatedProps } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { cn } from '@chefer/utils';
import {
  dashOffset,
  isOverTarget,
  mainFill,
  normaliseProgress,
  overflowFill,
  progressColor,
} from '../motion/progress';
import { useProgressValue } from '../motion/use-progress-value';
import { colors } from './theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** Below this the round cap would still paint a dot at 12 o'clock — hide it. */
const VISIBLE_EPSILON = 0.002;

export interface ProgressRingProps {
  /**
   * 0..1 of the target. Above 1 the ring is full; with `overColor` it also
   * switches colour and draws the excess as a second lap (up to 200%).
   */
  progress: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  trackColor?: string;
  /**
   * Over-target colour (MO-06), e.g. `colors.warning` for calories. Omit for
   * rings where "more than planned" is not a warning (gym week ring).
   */
  overColor?: string;
  /** Colour of the second lap past 100% (default: a darker amber). */
  overflowColor?: string;
  /** Centre content, e.g. <Text>2/3</Text>. */
  children?: React.ReactNode;
  className?: string;
  testID?: string;
  accessibilityLabel?: string;
}

/**
 * Circular progress (week ring, calorie ring). Starts at 12 o'clock, runs
 * clockwise, and animates from its previous value to the new one over
 * `deliberate` (600 ms, `enter` curve) on the UI thread — from 0 on first
 * mount. Under reduced motion it shows the final value immediately.
 */
export function ProgressRing({
  progress,
  size = 64,
  strokeWidth = 6,
  color = colors.primary,
  trackColor = colors.neutralSoft,
  overColor,
  overflowColor = colors.warningStrong,
  children,
  className,
  testID,
  accessibilityLabel,
}: ProgressRingProps) {
  const target = normaliseProgress(progress);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const centre = size / 2;
  const showOverflow = overColor !== undefined;
  const over = showOverflow && isOverTarget(target);

  const animated = useProgressValue(target);

  const mainProps = useAnimatedProps(() => {
    const fill = mainFill(animated.get());
    return {
      strokeDashoffset: dashOffset(circumference, fill),
      strokeOpacity: fill > VISIBLE_EPSILON ? 1 : 0,
    };
  });
  const lapProps = useAnimatedProps(() => {
    const fill = showOverflow ? overflowFill(animated.get()) : 0;
    return {
      strokeDashoffset: dashOffset(circumference, fill),
      strokeOpacity: fill > VISIBLE_EPSILON ? 1 : 0,
    };
  });

  const arc = {
    cx: centre,
    cy: centre,
    r: radius,
    strokeWidth,
    fill: 'none',
    strokeLinecap: 'round' as const,
    strokeDasharray: `${circumference} ${circumference}`,
    transform: `rotate(-90 ${centre} ${centre})`,
  };

  return (
    <View
      testID={testID}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(mainFill(target) * 100) }}
      className={cn('items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle
          cx={centre}
          cy={centre}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <AnimatedCircle
          {...(testID ? { testID: `${testID}-fill` } : {})}
          {...arc}
          stroke={progressColor(target, color, overColor)}
          animatedProps={mainProps}
        />
        {over ? (
          <AnimatedCircle
            {...(testID ? { testID: `${testID}-overflow` } : {})}
            {...arc}
            stroke={overflowColor}
            animatedProps={lapProps}
          />
        ) : null}
      </Svg>
      {children}
    </View>
  );
}
