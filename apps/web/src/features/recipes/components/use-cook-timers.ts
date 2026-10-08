'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  cookTimerRemaining,
  cookTimerStatus,
  newCookTimer,
  pauseCookTimer,
  resetCookTimer,
  startCookTimer,
  type CookTimer,
} from '@chefer/utils';

// UX-COOK-01 (web parity with apps/mobile cook-timers.ts): step timers are
// screen state held as absolute `endsAt` stamps. They used to live inside the
// step view and were thrown away on every step change, and the end was only a
// number turning into "Done!". Now they survive step changes, every running
// timer shows in the header, and the end vibrates and (when the tab is in the
// background and the browser already allows it) raises a notification.

const TICK_MS = 500;

export type CookTimers = Record<number, CookTimer>;

export type CookTimerView = {
  step: number;
  timer: CookTimer;
  status: ReturnType<typeof cookTimerStatus>;
  remainingSec: number;
};

function notifyEnd(recipeName: string, step: number): void {
  // Feature-detect: vibration exists on Android Chrome, not iOS Safari.
  navigator.vibrate?.([200, 100, 200]);
  try {
    if (
      typeof Notification !== 'undefined' &&
      Notification.permission === 'granted' &&
      document.visibilityState === 'hidden'
    ) {
      new Notification('Timer done', { body: `Step ${step + 1} of ${recipeName} is ready.` });
    }
  } catch {
    // Notifications are a convenience; the timer itself is unaffected.
  }
}

/** Asks once, only from the tap that starts a timer (browsers require a gesture). */
function askNotificationPermission(): void {
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      void Notification.requestPermission();
    }
  } catch {
    // Older Safari throws on the promise form — ignore.
  }
}

export function useCookTimers(recipeName: string) {
  const [timers, setTimers] = useState<CookTimers>({});
  const timersRef = useRef<CookTimers>({});
  const [now, setNow] = useState(() => Date.now());
  const announced = useRef<Set<string>>(new Set());
  const nameRef = useRef(recipeName);
  useEffect(() => {
    nameRef.current = recipeName;
  }, [recipeName]);

  const commit = useCallback((next: CookTimers) => {
    timersRef.current = next;
    setTimers(next);
  }, []);

  const anyRunning = Object.values(timers).some((t) => t.endsAt !== null);

  useEffect(() => {
    if (!anyRunning) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      for (const [step, timer] of Object.entries(timersRef.current)) {
        if (timer.endsAt === null || timer.endsAt > t) continue;
        const key = `${step}:${timer.endsAt}`;
        if (announced.current.has(key)) continue;
        announced.current.add(key);
        notifyEnd(nameRef.current, Number(step));
      }
    }, TICK_MS);
    return () => clearInterval(id);
  }, [anyRunning]);

  /** Start / resume, pause, or (when finished) reset. */
  const toggle = useCallback(
    (step: number, durationSec: number) => {
      const t = Date.now();
      setNow(t);
      const prev = timersRef.current;
      const current = prev[step] ?? newCookTimer(durationSec);
      const status = cookTimerStatus(current, t);
      if (status === 'running') commit({ ...prev, [step]: pauseCookTimer(current, t) });
      else if (status === 'done') commit({ ...prev, [step]: resetCookTimer(current) });
      else {
        askNotificationPermission();
        commit({ ...prev, [step]: startCookTimer(current, t) });
      }
    },
    [commit],
  );

  const reset = useCallback(
    (step: number) => {
      const current = timersRef.current[step];
      if (current) commit({ ...timersRef.current, [step]: resetCookTimer(current) });
    },
    [commit],
  );

  const view = (step: number, durationSec: number): CookTimerView => {
    const timer = timers[step] ?? newCookTimer(durationSec);
    return {
      step,
      timer,
      status: cookTimerStatus(timer, now),
      remainingSec: cookTimerRemaining(timer, now),
    };
  };

  const active: CookTimerView[] = Object.entries(timers)
    .map(([step, timer]) => ({
      step: Number(step),
      timer,
      status: cookTimerStatus(timer, now),
      remainingSec: cookTimerRemaining(timer, now),
    }))
    .filter((v) => v.status !== 'idle')
    .sort((a, b) => a.step - b.step);

  return { active, view, toggle, reset };
}
