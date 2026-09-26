'use client';

import * as React from 'react';

// Exit-then-unmount for overlays (MO-02). A controlled overlay unmounts the
// moment its parent flips `open` to false, which cut every exit animation
// short. usePresence keeps it mounted in a `closed` state until the exit has
// run, then drops it.
//
// The exit ends on `animationend` from the element itself, with a
// `setTimeout(exitMs + 50)` fallback: under the reduced-motion kill-switch,
// in a background tab or in jsdom `animationend` may never fire, and without
// the fallback the overlay would never unmount.

export type PresenceState = 'open' | 'closed';

export interface Presence {
  /** Render the overlay at all (open, or still running its exit). */
  present: boolean;
  /** Drive the enter/exit classes from this. */
  state: PresenceState;
  /** Attach to the animating element's onAnimationEnd to unmount early. */
  onAnimationEnd: (event: React.AnimationEvent<HTMLElement>) => void;
}

/** Slack on top of the exit duration before the fallback unmounts. */
export const PRESENCE_FALLBACK_SLACK_MS = 50;

export function usePresence(open: boolean, exitMs: number): Presence {
  const [present, setPresent] = React.useState(open);

  // Re-opening (even mid-exit) is immediate: adjust state during render, the
  // React-sanctioned way to derive state from a prop change.
  if (open && !present) setPresent(true);

  React.useEffect(() => {
    if (open || !present) return;
    const timer = setTimeout(() => setPresent(false), exitMs + PRESENCE_FALLBACK_SLACK_MS);
    return () => clearTimeout(timer);
  }, [open, present, exitMs]);

  const onAnimationEnd = React.useCallback(
    (event: React.AnimationEvent<HTMLElement>) => {
      // Ignore animations bubbling up from children (spinners, list items).
      if (!open && event.target === event.currentTarget) setPresent(false);
    },
    [open],
  );

  return { present: open || present, state: open ? 'open' : 'closed', onAnimationEnd };
}
