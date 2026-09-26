import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { useReducedMotion as useReanimatedReducedMotion } from 'react-native-reanimated';

/**
 * True when the OS asks for less motion (iOS Reduce Motion, Android "Remove
 * animations"). Reanimated's hook reads the setting once, synchronously, at
 * app start; this one also follows `reduceMotionChanged`, so toggling the
 * setting mid-session takes effect without a relaunch (motion-system.md §6).
 * Under reduced motion, movement becomes a ≤150 ms crossfade or an instant
 * change — haptics stay.
 */
export function useReducedMotion(): boolean {
  const atLaunch = useReanimatedReducedMotion();
  const [reduced, setReduced] = useState(atLaunch);

  useEffect(() => {
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => sub.remove();
  }, []);

  return reduced;
}
