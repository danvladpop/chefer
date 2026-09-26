import {
  Pressable,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { cssInterop } from 'nativewind';
import { pressScale as PRESS_SCALE } from '@chefer/tokens';
import { duration, springs, timing } from './motion';
import { useReducedMotion } from './use-reduced-motion';

// MO-01 press feedback. The whole control (background, border, label) scales
// to 0.97 — 0.98 for cards — the instant the finger lands (`instant` 100 ms,
// `standard` curve) and springs back (`snappy`) on release, on the UI thread.
// Disabled controls don't move; under reduced motion nothing scales (the
// `active:` opacity classes the callers keep are the feedback then).
//
// Why a cssInterop'd base instead of a className on the animated component:
// NativeWind merges inline `style` objects into ONE object, which would
// swallow Reanimated's animated-style marker. Registering the base with
// cssInterop turns `className` into a plain `style` BEFORE it reaches us, so
// the animated style stays its own array entry.

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type PressScale = keyof typeof PRESS_SCALE | number;

export interface PressableScaleProps extends Omit<PressableProps, 'style'> {
  className?: string;
  style?: StyleProp<ViewStyle>;
  /** `control` (0.97, default), `card` (0.98) or an explicit scale. */
  pressScale?: PressScale;
}

/** Resolve a `pressScale` prop to the scale the press animates to. */
export function resolvePressScale(scale: PressScale = 'control'): number {
  return typeof scale === 'number' ? scale : PRESS_SCALE[scale];
}

function PressableScaleBase({
  pressScale,
  disabled,
  onPressIn,
  onPressOut,
  style,
  ...props
}: PressableScaleProps) {
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  const to = resolvePressScale(pressScale);

  const handlePressIn = (event: GestureResponderEvent) => {
    if (!disabled && !reduced) {
      scale.set(withTiming(to, timing(duration.instant)));
    }
    onPressIn?.(event);
  };
  const handlePressOut = (event: GestureResponderEvent) => {
    if (!reduced) {
      scale.set(withSpring(1, springs.snappy));
    }
    onPressOut?.(event);
  };

  return (
    <AnimatedPressable
      {...props}
      disabled={disabled}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[style, animatedStyle]}
    />
  );
}

cssInterop(PressableScaleBase, { className: 'style' });

/** A Pressable that scales on press (MO-01). Drop-in for `Pressable`. */
export const PressableScale = PressableScaleBase;
