import { useEffect, useState } from 'react';
import {
  FadeIn,
  FadeInDown,
  FadeInLeft,
  FadeInRight,
  FadeOut,
  LinearTransition,
  ReduceMotion,
} from 'react-native-reanimated';
import { duration, exit, spring, stagger } from '@chefer/tokens';

// Entering / exiting / layout presets built from @chefer/tokens, so screens
// never hand-roll a duration (docs/mobile-ux-revamp/motion-premium.md).
// Every builder carries ReduceMotion.System: under the OS setting Reanimated
// skips them. Callers that read `useReducedMotion()` can still pass
// `undefined` instead, as the Following screens do.

/** How far a card rises as it fades in (MO-03), pt. */
export const ENTER_RISE = 8;

/**
 * MO-03 skeleton → content: fade in while rising 8 pt, `base` (220 ms) on the
 * `enter` curve, staggered 30 ms per item. Items past the 6th arrive with the
 * 6th, so a list never takes longer than ~150 ms of delay to land.
 */
export function enterUp(index = 0) {
  const step = Math.min(Math.max(0, index), stagger.maxItems - 1);
  return FadeInDown.duration(duration.base)
    .delay(step * stagger.step)
    .withInitialValues({ opacity: 0, transform: [{ translateY: ENTER_RISE }] })
    .reduceMotion(ReduceMotion.System);
}

/**
 * Step transitions (wizard steps, cook-mode steps): the new step slides in
 * 24 pt from the side you're heading (`1` forward = from the right) and
 * fades, `slow` (320 ms). Key the step's container so each step mounts.
 */
export function enterFromSide(direction: 1 | -1) {
  return (direction === 1 ? FadeInRight : FadeInLeft)
    .duration(duration.slow)
    .withInitialValues({ opacity: 0, transform: [{ translateX: direction * ENTER_RISE * 3 }] })
    .reduceMotion(ReduceMotion.System);
}

/** MO-04 list insert: a plain `base` fade (the layout spring moves the rest). */
export const listEntering = FadeIn.duration(duration.base).reduceMotion(ReduceMotion.System);

/** MO-04 list remove: fade out on the exit timing (≈70% of `base`). */
export const listExiting = FadeOut.duration(exit(duration.base)).reduceMotion(ReduceMotion.System);

/**
 * MO-04/05 layout: siblings glide to their new place on the `gentle` spring
 * when a row is added, removed or a section expands/collapses.
 */
export const listLayout = LinearTransition.springify()
  .damping(spring.gentle.damping)
  .stiffness(spring.gentle.stiffness)
  .mass(spring.gentle.mass)
  .reduceMotion(ReduceMotion.System);

// Screens remember (per app session) that they have played their entrance,
// so switching back to a tab never replays it.
const entered = new Set<string>();

/**
 * True on the first time `key` mounts this session, false afterwards — gate
 * `entering` on it so a tab's cards rise in on first load only (MO-03).
 */
export function useFirstEntrance(key: string): boolean {
  const [first] = useState(() => !entered.has(key));
  useEffect(() => {
    entered.add(key);
  }, [key]);
  return first;
}

/** Test hook: forget which screens have entered. */
export function resetEntrancesForTests(): void {
  entered.clear();
}
