import { useEffect, useState, type ReactNode } from 'react';
import { View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { duration, springs, timing } from './motion';
import { useReducedMotion } from './use-reduced-motion';

// MO-14 pop (docs/mobile-ux-revamp/motion-premium.md): a badge or hero that
// arrives with a little weight — scale 0.6 → 1 on the `bouncy` spring with a
// `fast` fade — optionally followed by one shine: a soft light band that
// sweeps across it once (`deliberate`, 600 ms). Used for the PR pill, the
// workout summary's trophy and PR card. It plays on mount only; reduced
// motion shows it in place with no shine.

export interface PopInProps {
  children: ReactNode;
  /** One light sweep after the pop (PR moments). */
  shine?: boolean;
  /** Wait before popping (choreography), ms. */
  delayMs?: number;
  /** Starting scale (default 0.6). */
  from?: number;
  /** Corner radius the shine is clipped to (default: a pill). */
  radius?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const SHINE_WIDTH = 28;

export function PopIn({
  children,
  shine = false,
  delayMs = 0,
  from = 0.6,
  radius = 999,
  style,
  testID,
}: PopInProps) {
  const reduced = useReducedMotion();
  const scale = useSharedValue(reduced ? 1 : from);
  const opacity = useSharedValue(reduced ? 1 : 0);
  const sweep = useSharedValue(0);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (reduced) {
      scale.set(1);
      opacity.set(1);
      return;
    }
    scale.set(withDelay(delayMs, withSpring(1, springs.bouncy)));
    opacity.set(withDelay(delayMs, withTiming(1, timing(duration.fast, 'enter'))));
  }, [reduced, delayMs, scale, opacity]);

  useEffect(() => {
    if (!shine || reduced || width === 0) return;
    sweep.set(0);
    sweep.set(
      withDelay(delayMs + duration.base, withTiming(1, timing(duration.deliberate, 'standard'))),
    );
  }, [shine, reduced, width, delayMs, sweep]);

  const popStyle = useAnimatedStyle(() => ({
    opacity: opacity.get(),
    transform: [{ scale: scale.get() }],
  }));
  const shineStyle = useAnimatedStyle(() => ({
    opacity: sweep.get() > 0 && sweep.get() < 1 ? 0.55 : 0,
    transform: [
      { translateX: -SHINE_WIDTH + sweep.get() * (width + SHINE_WIDTH * 2) },
      { skewX: '-20deg' },
    ],
  }));

  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);

  return (
    <Animated.View
      testID={testID}
      style={[style, popStyle]}
      onLayout={shine ? onLayout : undefined}
    >
      {children}
      {shine && !reduced ? (
        <View
          pointerEvents="none"
          accessible={false}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            overflow: 'hidden',
            borderRadius: radius,
          }}
        >
          <Animated.View
            style={[
              {
                position: 'absolute',
                top: -4,
                bottom: -4,
                left: 0,
                width: SHINE_WIDTH,
                backgroundColor: 'rgba(255,255,255,0.9)',
              },
              shineStyle,
            ]}
          />
        </View>
      ) : null}
    </Animated.View>
  );
}
