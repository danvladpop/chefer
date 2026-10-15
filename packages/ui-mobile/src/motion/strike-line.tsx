import { useEffect, useRef } from 'react';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { duration, timing } from './motion';
import { useReducedMotion } from './use-reduced-motion';

// MO-17 strike-through (docs/mobile-ux-revamp/motion-premium.md): a line that
// sweeps across a label left → right (`scaleX` from the left, never `width`)
// when an item is checked off, and retracts when it is unchecked. Place it
// inside a `relative` wrapper around the text; it covers the wrapper's width.
// First render shows the current state; reduced motion → instant.

export interface StrikeLineProps {
  active: boolean;
  color: string;
  /** Line thickness in pt (default 1.5). */
  thickness?: number;
  testID?: string;
}

export function StrikeLine({ active, color, thickness = 1.5, testID }: StrikeLineProps) {
  const reduced = useReducedMotion();
  const progress = useSharedValue(active ? 1 : 0);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const to = active ? 1 : 0;
    progress.set(
      reduced
        ? to
        : withTiming(to, active ? timing(duration.base, 'enter') : timing(duration.fast, 'exit')),
    );
  }, [active, reduced, progress]);

  const style = useAnimatedStyle(() => ({
    opacity: progress.get() > 0.01 ? 1 : 0,
    transform: [{ scaleX: progress.get() }],
  }));

  return (
    <Animated.View
      testID={testID}
      pointerEvents="none"
      accessible={false}
      style={[
        {
          position: 'absolute',
          left: 0,
          right: 0,
          top: '50%',
          height: thickness,
          marginTop: -thickness / 2,
          backgroundColor: color,
          borderRadius: thickness,
          transformOrigin: 'left',
        },
        style,
      ]}
    />
  );
}
