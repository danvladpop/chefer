import { useEffect } from 'react';
import { useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { duration, timing } from './motion';
import { normaliseProgress } from './progress';
import { useReducedMotion } from './use-reduced-motion';

/**
 * A shared value that follows `progress` (MO-06): 0 on first mount, then each
 * committed change animates from where it is now over `deliberate` (600 ms)
 * with the `enter` curve, on the UI thread. Under reduced motion it jumps.
 */
export function useProgressValue(progress: number): SharedValue<number> {
  const reduced = useReducedMotion();
  const target = normaliseProgress(progress);
  const value = useSharedValue(reduced ? target : 0);

  useEffect(() => {
    value.set(reduced ? target : withTiming(target, timing(duration.deliberate, 'enter')));
  }, [reduced, target, value]);

  return value;
}
