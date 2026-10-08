import { useCallback, useEffect, useRef } from 'react';

// iOS cannot present a second modal while the first is still dismissing, so a
// sheet row that opens another sheet runs it from the first sheet's `onExited`.
// If that signal never comes (a sheet closed some other way), the same step
// runs after this long.
const FALLBACK_MS = 700;

/**
 * `schedule(fn)` stores `fn` to run once the sheet that is closing has fully
 * exited — wire `onExited` to the sheet's `onExited`. Runs at most once.
 */
export function useAfterSheetExit(): {
  schedule: (fn: () => void) => void;
  onExited: () => void;
} {
  const pending = useRef<(() => void) | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const run = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const fn = pending.current;
    pending.current = null;
    fn?.();
  }, []);

  const schedule = useCallback(
    (fn: () => void) => {
      pending.current = fn;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(run, FALLBACK_MS);
    },
    [run],
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return { schedule, onExited: run };
}
