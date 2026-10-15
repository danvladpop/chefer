import { useEffect, useRef, type ReactNode } from 'react';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { duration, springs, timing, useReducedMotion } from '@chefer/ui-mobile';

// Premium motion #9 (MO-14 pop, docs/mobile-ux-revamp/motion-premium.md): the
// tab icon that just became active does a small bounce (1 → 1.12 → 1: `fast`
// up, `snappy` spring back). Never on first render, never under reduced motion.

export const TAB_ICON_POP = 1.12;

export function TabIcon({ focused, children }: { focused: boolean; children: ReactNode }) {
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!focused || reduced) return;
    scale.set(
      withSequence(
        withTiming(TAB_ICON_POP, timing(duration.fast, 'enter')),
        withSpring(1, springs.snappy),
      ),
    );
  }, [focused, reduced, scale]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}
