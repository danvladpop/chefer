import { useRef } from 'react';
import {
  PanResponder,
  type GestureResponderEvent,
  type PanResponderGestureState,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { duration, springs, timing, useReducedMotion } from '@chefer/ui-mobile';

// PAT-16 (Δ2.6, T-05.A1.2): swipe-to-remove without `react-native-gesture-handler`
// (a native dependency would need a new binary, which cannot ship over OTA — see
// 04-technical-plan.md §2.6). Built on RN core `PanResponder` driving a Reanimated
// shared value, both already in the binary.
//
// The responder only claims the gesture once horizontal intent is clear
// (`shouldClaimSwipe`), so a vertical drag is left for the enclosing
// ScrollView — this must never fight the workout screen's scroll. It is
// always paired with a visible `⋯` menu / long-press path that does the same
// removal (this component is progressive enhancement, never the only way to
// remove a set — Δ2.6, AC14).

const CLAIM_DX = 12;
const CLAIM_RATIO = 2;
/** Fraction of the row's own width a swipe must cross to count as "remove". */
const REMOVE_FRACTION = 0.35;
/** A fast flick past the claim threshold also removes, even if short. */
const FLICK_VELOCITY = 0.5;

/** Horizontal-intent test: only claim the gesture once it is clearly a swipe, not a scroll. */
export function shouldClaimSwipe(dx: number, dy: number): boolean {
  return Math.abs(dx) > CLAIM_DX && Math.abs(dx) > CLAIM_RATIO * Math.abs(dy);
}

/** Whether a released left-swipe crossed the remove threshold (distance or a fast flick). */
export function shouldRemove(dx: number, rowWidth: number, vx: number): boolean {
  if (dx >= 0) return false;
  if (rowWidth <= 0) return Math.abs(dx) > CLAIM_DX && vx <= -FLICK_VELOCITY;
  return (
    Math.abs(dx) > rowWidth * REMOVE_FRACTION || (Math.abs(dx) > CLAIM_DX && vx <= -FLICK_VELOCITY)
  );
}

export interface SwipeToRemoveProps {
  /** Same action the ⋯ menu / long-press already trigger (removeSet + Undo snackbar). */
  onRemove: () => void;
  children: React.ReactNode;
  testID?: string;
}

// No accessibility-action shim here on purpose: this wrapper's own
// onStartShouldSetResponder always declines (it only claims the gesture on a
// clearly horizontal move), which reads to assistive tech and to RNTL's own
// touch-responder heuristics as "disabled". The `⋯` menu / long-press this is
// always paired with is the real, independently accessible affordance
// (Δ2.6): a screen-reader or keyboard user never needs the swipe itself.
export function SwipeToRemove({ onRemove, children, testID }: SwipeToRemoveProps) {
  const reduced = useReducedMotion();
  const translateX = useSharedValue(0);
  const rowWidth = useRef(0);
  // The row unmounts (its set is removed from the reducer) right after the
  // fly-away animation completes, so the callback must read the latest prop.
  const onRemoveRef = useRef(onRemove);
  onRemoveRef.current = onRemove;

  const settle = () => {
    translateX.set(reduced ? 0 : withSpring(0, springs.snappy));
  };

  const fly = () => {
    if (reduced) {
      onRemoveRef.current();
      translateX.set(0);
      return;
    }
    const distance = -Math.max(rowWidth.current, 200);
    translateX.set(
      withTiming(distance, timing(duration.base, 'exit'), (finished) => {
        'worklet';
        if (finished) scheduleOnRN(onRemoveRef.current);
      }),
    );
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_e: GestureResponderEvent, g: PanResponderGestureState) =>
        shouldClaimSwipe(g.dx, g.dy),
      onPanResponderMove: (_e: GestureResponderEvent, g: PanResponderGestureState) => {
        // Only ever pull left; a rightward slop (finger drifting back) clamps to 0.
        translateX.set(Math.min(0, g.dx));
      },
      onPanResponderRelease: (_e: GestureResponderEvent, g: PanResponderGestureState) => {
        if (shouldRemove(g.dx, rowWidth.current, g.vx)) fly();
        else settle();
      },
      onPanResponderTerminate: settle,
    }),
  ).current;

  const style = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.get() }] }));

  return (
    <Animated.View
      testID={testID}
      style={style}
      onLayout={(e) => {
        rowWidth.current = e.nativeEvent.layout.width;
      }}
      {...responder.panHandlers}
    >
      {children}
    </Animated.View>
  );
}
