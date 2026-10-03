import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useIsFocused } from 'expo-router';
import { localDateStr } from '@chefer/utils';

/**
 * UX-FOOD-18: a tab screen stays mounted overnight, so state seeded from "today"
 * at mount (Plan's selected day and week) kept pointing at yesterday after
 * midnight. Calls `onRollover` when the device's calendar date differs from the
 * last time it was checked, on every tab focus and every return to the
 * foreground. `markChecked()` tells the hook the caller just re-seeded from
 * today (e.g. applied deep-link params), so a rollover is not re-applied over it.
 */
export function useDayRollover(onRollover: () => void): { markChecked: () => void } {
  const lastDate = useRef(localDateStr());
  const callback = useRef(onRollover);
  callback.current = onRollover;

  const check = useCallback(() => {
    const now = localDateStr();
    if (now === lastDate.current) return;
    lastDate.current = now;
    callback.current();
  }, []);

  const focused = useIsFocused();
  useEffect(() => {
    if (focused) check();
  }, [focused, check]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => sub.remove();
  }, [check]);

  return {
    markChecked: useCallback(() => {
      lastDate.current = localDateStr();
    }, []),
  };
}
