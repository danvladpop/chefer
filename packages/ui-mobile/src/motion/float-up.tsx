import { useEffect, type ReactNode } from 'react';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { duration, timing } from './motion';
import { useReducedMotion } from './use-reduced-motion';

// MO-16 companion (docs/mobile-ux-revamp/motion-premium.md): a small label
// ("+520 kcal") that rises 16 pt above what was just ticked and fades out,
// so the number visibly travels toward the day's total. `deliberate`
// (600 ms) on the `enter` curve. Plays each time `play` increases; nothing
// under reduced motion (the gauge's own count-up still tells the story).
// Decorative: hidden from screen readers.

export const FLOAT_UP_RISE = 16;

export interface FloatUpProps {
  /** Increment to play; 0 = never. */
  play: number;
  children: ReactNode;
  testID?: string;
}

/** Absolutely positioned: place it inside a `relative` box, centred above it. */
export function FloatUp({ play, children, testID }: FloatUpProps) {
  const reduced = useReducedMotion();
  const k = useSharedValue(0);

  useEffect(() => {
    if (play <= 0 || reduced) return;
    k.set(0);
    k.set(withTiming(1, timing(duration.deliberate, 'enter')));
  }, [play, reduced, k]);

  const style = useAnimatedStyle(() => {
    const v = k.get();
    return {
      opacity: v <= 0 || v >= 1 ? 0 : v < 0.25 ? v / 0.25 : 1 - (v - 0.25) / 0.75,
      transform: [{ translateY: -FLOAT_UP_RISE * v }],
    };
  });

  if (play <= 0 || reduced) return null;

  return (
    <Animated.View
      testID={testID}
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[
        { position: 'absolute', top: -18, left: -40, right: -40, alignItems: 'center' },
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
}
