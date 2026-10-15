// react-native-svg's typings mark `x`/`y` deprecated via TransformProps; on Rect
// they are positional attributes, not transforms.
/* eslint-disable @typescript-eslint/no-deprecated */
import { useEffect, useId } from 'react';
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { ClipPath, Defs, Rect } from 'react-native-svg';
import { duration, timing } from '../../motion/motion';
import { useReducedMotion } from '../../motion/use-reduced-motion';

// Chart draw-in (premium motion #18, MO-06 family): a clip rect that uncovers
// the plotted marks over `deliberate` (600 ms, `enter`) — left → right for
// lines, bottom → up for bars. Plays on mount and whenever `signature` (the
// data's shape, e.g. a new range) changes. Axes and labels sit outside the
// clip, so only the data moves. Reduced motion: fully shown at once.

const AnimatedRect = Animated.createAnimatedComponent(Rect);

/** A 0 → 1 reveal that restarts when `signature` changes. */
export function useChartReveal(signature: string): SharedValue<number> {
  const reduced = useReducedMotion();
  const progress = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) {
      progress.set(1);
      return;
    }
    progress.set(0);
    progress.set(withTiming(1, timing(duration.deliberate, 'enter')));
  }, [signature, reduced, progress]);
  return progress;
}

/** A clip-path id that is safe inside `url(#…)`. */
export function useClipId(): string {
  return `reveal${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
}

export interface RevealClipProps {
  id: string;
  progress: SharedValue<number>;
  /** `x` uncovers left → right (lines), `y` bottom → up (bars). */
  direction: 'x' | 'y';
  width: number;
  height: number;
}

/** `<Defs>` with the animated clip; give the marks' `<G clipPath={`url(#${id})`}>`. */
export function RevealClip({ id, progress, direction, width, height }: RevealClipProps) {
  const props = useAnimatedProps(() => {
    const k = Math.min(1, Math.max(0, progress.get()));
    return direction === 'x'
      ? { x: 0, y: 0, width: width * k, height }
      : { x: 0, y: height * (1 - k), width, height: height * k };
  });
  return (
    <Defs>
      <ClipPath id={id}>
        <AnimatedRect testID="chart-reveal-clip" animatedProps={props} />
      </ClipPath>
    </Defs>
  );
}
