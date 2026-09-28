'use client';

import { useEffect, useRef, useState } from 'react';
import type { PlanTailoring } from '@chefer/types';
import { newlyTailoredDays } from '@chefer/utils';

/** How long a just-replaced day keeps its "updated by your chef" highlight. */
const UPDATED_HIGHLIGHT_MS = 2_400;
/** How long the DONE confirmation stays before the banner steps aside. */
const DONE_CONFIRM_MS = 8_000;

/**
 * Follows a plan's live tailoring between polls: whether the user watched it
 * run (DONE is only confirmed then), which days were just replaced (for the
 * brief highlight), and hides the DONE confirmation after a few seconds.
 * Resets when the plan changes (regenerate, week switch).
 */
export function useTailoringWatch(
  planId: string | undefined,
  tailoring: PlanTailoring | null | undefined,
  onDaysUpdated?: (days: number[]) => void,
): { sawRunning: boolean; updatedDays: ReadonlySet<number> } {
  const [sawRunning, setSawRunning] = useState(false);
  const [updatedDays, setUpdatedDays] = useState<ReadonlySet<number>>(new Set());
  const previous = useRef<{ planId: string | undefined; tailoring: PlanTailoring | null }>({
    planId: undefined,
    tailoring: null,
  });
  // Highlight timers outlive the poll that started them (the next poll must
  // not cancel them); all are cleared on unmount.
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  useEffect(() => {
    const prev = previous.current;
    const samePlan = prev.planId === planId;
    previous.current = { planId, tailoring: tailoring ?? null };
    if (!samePlan) {
      setSawRunning(tailoring?.status === 'RUNNING');
      setUpdatedDays(new Set());
      return;
    }
    if (tailoring?.status === 'RUNNING') setSawRunning(true);
    // Only days that flipped while this screen watched — never the whole
    // week on first load.
    const fresh = prev.tailoring ? newlyTailoredDays(prev.tailoring, tailoring) : [];
    if (fresh.length === 0) return;
    onDaysUpdated?.(fresh);
    setUpdatedDays((s) => new Set([...s, ...fresh]));
    timers.current.push(
      setTimeout(() => {
        setUpdatedDays((s) => new Set([...s].filter((d) => !fresh.includes(d))));
      }, UPDATED_HIGHLIGHT_MS),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the data that changes per poll
  }, [planId, tailoring?.status, tailoring?.tailoredDays.length, tailoring?.keptDays.length]);

  useEffect(() => {
    if (tailoring?.status !== 'DONE' || !sawRunning) return;
    const timer = setTimeout(() => setSawRunning(false), DONE_CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [tailoring?.status, sawRunning]);

  return { sawRunning, updatedDays };
}
