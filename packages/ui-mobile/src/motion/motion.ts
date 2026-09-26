import {
  Easing,
  ReduceMotion,
  type WithSpringConfig,
  type WithTimingConfig,
} from 'react-native-reanimated';
import { duration, easing, spring, type EasingName, type SpringName } from '@chefer/tokens';

// Reanimated configs built from @chefer/tokens (motion-system.md §2.2). Every
// config carries ReduceMotion.System, so the OS "Reduce Motion" / Android
// "Remove animations" setting makes Reanimated jump straight to the end value
// even where a component forgets its own reduced-motion branch.

const bez = (k: EasingName) => {
  const [x1, y1, x2, y2] = easing[k];
  return Easing.bezier(x1, y1, x2, y2);
};

/** withTiming config for `ms` on one of the token curves (default `standard`). */
export const timing = (ms: number, curve: EasingName = 'standard'): WithTimingConfig => ({
  duration: ms,
  easing: bez(curve),
  reduceMotion: ReduceMotion.System,
});

/** withSpring configs for the token springs. */
export const springs: Record<SpringName, WithSpringConfig> = {
  snappy: { ...spring.snappy, reduceMotion: ReduceMotion.System },
  gentle: { ...spring.gentle, reduceMotion: ReduceMotion.System },
  bouncy: { ...spring.bouncy, reduceMotion: ReduceMotion.System },
};

export { duration };
