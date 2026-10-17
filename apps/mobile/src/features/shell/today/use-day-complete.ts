import { useEffect, useRef, useState } from 'react';
import { haptics } from '@chefer/ui-mobile';
import type { DaySlot } from './today-helpers';

// MO-18 day complete (docs/mobile-ux-revamp/motion-premium.md): ticking the
// day's last planned meal earns one confetti burst over the gauge and a
// success haptic. Only on the transition seen on this screen (a day that
// loads already complete stays quiet) and once per calendar day per session.

const celebratedDays = new Set<string>();

/** Every slot that counts (not skipped) is eaten, and there is at least one. */
export function isDayComplete(slots: readonly DaySlot[]): boolean {
  const counted = slots.filter((s) => s.state !== 'skipped');
  return counted.length > 0 && counted.every((s) => s.state === 'done');
}

/** A burst counter for `<Celebration play>`: bumps when `slots` turn complete. */
export function useDayCompleteBurst(slots: readonly DaySlot[], date: string): number {
  const complete = isDayComplete(slots);
  const previous = useRef<boolean | null>(null);
  const [burst, setBurst] = useState(0);

  useEffect(() => {
    const was = previous.current;
    previous.current = complete;
    if (was === false && complete && !celebratedDays.has(date)) {
      celebratedDays.add(date);
      haptics.success();
      setBurst((b) => b + 1);
    }
  }, [complete, date]);

  return burst;
}

/** Test hook. */
export function resetDayCompleteForTests(): void {
  celebratedDays.clear();
}
