import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { duration, springs, timing } from './motion';
import { useReducedMotion } from './use-reduced-motion';

// MO-16 check-off (docs/mobile-ux-revamp/motion-premium.md): the one tick
// every "done" moment shares (meal slot, shop item, workout set). On a change
// to `checked` the disc grows from the centre on the `bouncy` spring and the
// tick draws itself along its stroke in `fast` (150 ms); unticking runs it
// backwards on `exit` timings. The first render shows the current state with
// no animation, so a list that mounts already ticked never replays. Reduced
// motion → instant swap. Haptics stay with the caller (`haptics.tick`).

const AnimatedPath = Animated.createAnimatedComponent(Path);

/** The tick inside a 24×24 box, and its stroke length (for the draw-in). */
const CHECK_PATH = 'M6.5 12.5l3.6 3.6 7.4-8.2';
export const CHECK_PATH_LENGTH = 17;

export interface AnimatedCheckProps {
  checked: boolean;
  /** Outer diameter in pt (default 36). */
  size?: number;
  /** Disc colour when checked. */
  fillColor: string;
  /** Tick colour (on the disc). */
  checkColor: string;
  /** Ring colour while unchecked (omit for no ring). */
  ringColor?: string;
  /** Background while unchecked (default transparent). */
  emptyColor?: string;
  /** Rounded square instead of a circle (shop checkbox). */
  shape?: 'circle' | 'square';
  testID?: string;
}

/** A circle (or rounded square) that fills and draws a tick when checked. */
export function AnimatedCheck({
  checked,
  size = 36,
  fillColor,
  checkColor,
  ringColor,
  emptyColor = 'transparent',
  shape = 'circle',
  testID,
}: AnimatedCheckProps) {
  const reduced = useReducedMotion();
  const fill = useSharedValue(checked ? 1 : 0);
  const draw = useSharedValue(checked ? 1 : 0);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const to = checked ? 1 : 0;
    if (reduced) {
      fill.set(to);
      draw.set(to);
      return;
    }
    if (checked) {
      fill.set(withSpring(1, springs.bouncy));
      draw.set(withTiming(1, timing(duration.fast, 'enter')));
    } else {
      draw.set(withTiming(0, timing(duration.instant, 'exit')));
      fill.set(withTiming(0, timing(duration.fast, 'exit')));
    }
  }, [checked, reduced, fill, draw]);

  const discStyle = useAnimatedStyle(() => ({
    opacity: fill.get() > 0.01 ? 1 : 0,
    transform: [{ scale: Math.max(0, fill.get()) }],
  }));
  const tickProps = useAnimatedProps(() => ({
    strokeDashoffset: CHECK_PATH_LENGTH * (1 - Math.min(1, Math.max(0, draw.get()))),
  }));

  const radius = shape === 'circle' ? size / 2 : Math.round(size * 0.28);
  const ring = ringColor ? Math.max(2, Math.round(size / 18)) : 0;
  const tickSize = Math.round(size * 0.66);

  return (
    <View
      testID={testID}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        borderWidth: ring,
        borderColor: checked ? fillColor : ringColor,
        backgroundColor: emptyColor,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: -ring,
            left: -ring,
            width: size,
            height: size,
            borderRadius: radius,
            backgroundColor: fillColor,
          },
          discStyle,
        ]}
      />
      <Svg width={tickSize} height={tickSize} viewBox="0 0 24 24">
        <AnimatedPath
          d={CHECK_PATH}
          stroke={checkColor}
          strokeWidth={2.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          strokeDasharray={CHECK_PATH_LENGTH}
          animatedProps={tickProps}
        />
      </Svg>
    </View>
  );
}
