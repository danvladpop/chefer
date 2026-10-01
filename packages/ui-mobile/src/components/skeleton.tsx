import { useEffect } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { cssInterop } from 'nativewind';
import { cn } from '@chefer/utils';
import { timing } from '../motion/motion';
import { useReducedMotion } from '../motion/use-reduced-motion';

// Same cssInterop trick as PressableScale: className becomes a plain `style`
// BEFORE it reaches Reanimated, so the animated style stays its own array entry.
const AnimatedView = Animated.createAnimatedComponent(View);
cssInterop(AnimatedView, { className: 'style' });

/** One shimmer cycle (MO-03): fade down for half of it, back up for the other half. */
export const SKELETON_CYCLE_MS = 1200;
/** Lowest opacity of the pulse. */
export const SKELETON_LOW_OPACITY = 0.5;

export type SkeletonProps = {
  /** Size and shape classes (default `h-4 w-full rounded-md`). */
  className?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Loading placeholder block (MO-03). A 1.2 s opacity pulse on the UI thread —
 * opacity only, never layout. Under reduced motion it is a static block (and
 * every timing carries `ReduceMotion.System` as a second safety net). It is
 * hidden from the accessibility tree: label the loading region itself.
 */
export function Skeleton({ className, style, testID }: SkeletonProps) {
  const reduced = useReducedMotion();
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (reduced) {
      cancelAnimation(opacity);
      opacity.set(1);
      return;
    }
    const half = SKELETON_CYCLE_MS / 2;
    opacity.set(
      withRepeat(
        withSequence(withTiming(SKELETON_LOW_OPACITY, timing(half)), withTiming(1, timing(half))),
        -1,
      ),
    );
    return () => cancelAnimation(opacity);
  }, [reduced, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.get() }));

  return (
    <AnimatedView
      testID={testID}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className={cn('h-4 w-full rounded-md bg-muted', className)}
      style={[style, animatedStyle]}
    />
  );
}
