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

// Same cssInterop trick as PressableScale: the LOCAL base below is registered,
// so `className` becomes a plain `style` before it reaches Reanimated and the
// animated style stays its own array entry. Never register the animated
// component itself: Reanimated's Jest mock returns `View` from
// `createAnimatedComponent`, which would re-register every `View`.
const AnimatedView = Animated.createAnimatedComponent(View);

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
function SkeletonBase({ style, testID }: SkeletonProps) {
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
      style={[style, animatedStyle]}
    />
  );
}

cssInterop(SkeletonBase, { className: 'style' });

export function Skeleton({ className, ...props }: SkeletonProps) {
  return <SkeletonBase {...props} className={cn('h-4 w-full rounded-md bg-muted', className)} />;
}
