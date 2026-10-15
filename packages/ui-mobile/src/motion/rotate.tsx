import { useEffect, type ReactNode } from 'react';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { duration, timing } from './motion';
import { useReducedMotion } from './use-reduced-motion';

// MO-05 companion: a disclosure chevron turns 180° with its section instead
// of swapping icons (`base`, `standard`). Reduced motion → it just flips.

export interface RotateProps {
  /** True = turned (e.g. the section is open). */
  turned: boolean;
  /** Degrees when turned (default 180). */
  degrees?: number;
  children: ReactNode;
}

export function Rotate({ turned, degrees = 180, children }: RotateProps) {
  const reduced = useReducedMotion();
  const angle = useSharedValue(turned ? degrees : 0);
  useEffect(() => {
    const to = turned ? degrees : 0;
    angle.set(reduced ? to : withTiming(to, timing(duration.base)));
  }, [turned, degrees, reduced, angle]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${angle.get()}deg` }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}
